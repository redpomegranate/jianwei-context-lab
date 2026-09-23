import type { Request } from "express";
import { publicConfig } from "./config";
import { ApiError } from "./errors";

export interface AuthContext {
  token: string;
  userId: string;
}

function bearer(req: Request): string {
  const value = req.header("authorization");
  if (!value?.startsWith("Bearer ") || value.length <= 7) {
    throw new ApiError(401, "UNAUTHORIZED", "需要登录");
  }
  return value.slice(7);
}

export async function authenticate(req: Request): Promise<AuthContext> {
  const token = bearer(req);
  const response = await fetch(`${publicConfig.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publicConfig.publishableKey,
      authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new ApiError(401, "UNAUTHORIZED", "登录已失效");
  }
  const user = (await response.json()) as { id?: string };
  if (!user.id) throw new ApiError(401, "UNAUTHORIZED", "登录已失效");
  return { token, userId: user.id };
}

const pageSize = 500;
const maxPages = 200;

async function request(
  auth: AuthContext,
  path: string,
  init: RequestInit = {},
): Promise<{ data: unknown; response: Response }> {
  const response = await fetch(`${publicConfig.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: publicConfig.publishableKey,
      authorization: `Bearer ${auth.token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const detail = data as { code?: string; message?: string };
    const code = detail.code ?? "DATA_ERROR";
    if (code === "P0002") throw new ApiError(404, "NOT_FOUND", "记录不存在");
    if (code === "PGRST205") throw new ApiError(404, "MISSING_RELATION", "数据表尚未建立");
    if (code === "40001" || code === "23505" || code === "P0001") {
      throw new ApiError(409, "CONFLICT", detail.message ?? "状态冲突");
    }
    throw new ApiError(400, "DATA_ERROR", "数据操作失败");
  }
  return { data, response };
}

export async function rpc(
  auth: AuthContext,
  name: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const result = await request(auth, `rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return result.data;
}

export async function select(
  auth: AuthContext,
  resource: string,
  query: string,
): Promise<unknown> {
  const result = await request(auth, `${resource}?${query}`);
  return result.data;
}

function totalFromContentRange(header: string | null): number | null {
  const match = header?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export async function selectAll(
  auth: AuthContext,
  resource: string,
  query: string,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const result = await request(auth, `${resource}?${query}`, {
      headers: {
        range: `${offset}-${offset + pageSize - 1}`,
        prefer: "count=exact",
      },
    });
    if (!Array.isArray(result.data)) {
      throw new ApiError(500, "DATA_ERROR", "分页结果不是列表");
    }
    rows.push(...result.data);
    const total = totalFromContentRange(result.response.headers.get("content-range"));
    if (result.data.length < pageSize || (total !== null && rows.length >= total)) {
      return rows;
    }
  }
  throw new ApiError(500, "EXPORT_TRUNCATED", "数据超过分页上限，导出已停止");
}
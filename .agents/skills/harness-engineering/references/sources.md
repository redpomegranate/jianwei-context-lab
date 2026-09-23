# 来源与改编边界

仓库：https://github.com/bojieli/ai-agent-book
读取日期：2026-09-23。
固定版本：73ffc0d73ad5fe210c73f3c7c3f6dc605554b0f3。
方法：读取中文相关章节和具体段落，不声称通读全部正文、实验或核验全部外链。
仓库根 LICENSE 为 Apache-2.0；本包为原创归纳和项目化指令，未打包书籍全文或代码。

## 来源映射

| 来源 | 重点读取 | Skill 中的应用 |
| --- | --- | --- |
| [第1章](https://github.com/bojieli/ai-agent-book/blob/73ffc0d73ad5fe210c73f3c7c3f6dc605554b0f3/book/chapter1.md) | Harness 工程：模型之外的竞争力 | 五要素、Agent 与环境边界 |
| [第2章](https://github.com/bojieli/ai-agent-book/blob/73ffc0d73ad5fe210c73f3c7c3f6dc605554b0f3/book/chapter2.md) | 动态提示词与 Agent Skills，尤其 Skills 结构与编写方法 | 元数据、主流程、按需参考资料 |
| [第4章](https://github.com/bojieli/ai-agent-book/blob/73ffc0d73ad5fe210c73f3c7c3f6dc605554b0f3/book/chapter4.md) | 工具设计通用原则、参数保真性 | 工具契约、安全操作专用化、避免静默改参 |
| [第5章](https://github.com/bojieli/ai-agent-book/blob/73ffc0d73ad5fe210c73f3c7c3f6dc605554b0f3/book/chapter5.md) | Coding Agent 流程、Harness 实践、故障恢复 | 验收基线、执行边界、结构化反馈、有限恢复 |
| [第7章](https://github.com/bojieli/ai-agent-book/blob/73ffc0d73ad5fe210c73f3c7c3f6dc605554b0f3/book/chapter7.md) | 首错归因、评估驱动迭代、统计显著性、可观测性 | 证据链、基线对比、脱敏轨迹到回归集 |
| [第9章](https://github.com/bojieli/ai-agent-book/blob/73ffc0d73ad5fe210c73f3c7c3f6dc605554b0f3/book/chapter9.md) | 持续进化闭环、可验证边界、安全边界 | 在线/离线双循环、候选隔离、禁止自改裁判 |

## 本包新增而非书中原定规范

- Design/Build/Audit/Improve 模式、文件布局和任务模板。
- 各类恢复次数起点、具体状态命名与证据字段。
- Next.js/Supabase/Vercel 适配建议。
- 社会情境训练中的预测锁定、不读心、用户先判断及无法判断处理。
- 对幂等、并发、隐私和发布的具体检查项及场景化验收表。

书中行业案例与数字只作为背景，不作为本项目已达可靠性的证据。
后续更新时先比较来源版本，审查差异，不自动抓取并覆盖正式 Skill。

## v0.2 生产化扩展

production-standard、production-readiness 和 production-scenarios 为本次审查新增的
分布式系统、安全工程及服务运维要求，不声称是原书逐条规定，也未做外部标准认证。
特别包括 SLO/错误预算、fencing、审批绑定、成本预留、备份恢复、灰度与值班责任。
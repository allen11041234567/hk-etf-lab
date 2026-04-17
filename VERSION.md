# 对外稳态版 M1

- 名称：对外稳态版 M1
- 英文名：Public Stable Mobile M1
- 固化时间：2026-04-17 UTC

## 目标

这是当前面向外部访问的稳定基线版本，重点目标是：
- 首页与高频入口页可直接对外展示
- 手机端更适配，但不影响电脑端主结构
- 主站重要展示逻辑以源头实现，避免刷新或后续更新后回退

## 当前纳入稳态范围的页面

1. `/`
2. `/insight/korea-tech-briefing`
3. `/insight/trump-truth-archive`
4. `/research/masters-hk-etf`
5. `/daily/morning-report`
6. `/logbias/pool-state`
7. `/logbias/pool/overview`
8. `/dev/index`

## 本版已确认的关键规则

- 首页维持当前层级：`今日最值得看` + `更多内容`
- 韩国科技页对外显示中文，不暴露数据源过程说明
- Trump 主页以 `trump-truth-archive` 为长期主版本
- 大师测试总页使用 10 位大师真实头像方案
- `pool-state` 页保留 `每日买入卖出信号` 区块
- `pool-state` 页不显示：`当 Longbridge 不可用时，自动切换备用数据源计算`
- 手机适配优先通过移动端断点微调完成，不改桌面主布局

## 版本演进约定

- 小修小补：`M1.1`, `M1.2`
- 明显结构升级：`M2`

## 备注

如后续页面更新与本文件冲突，以“不要破坏当前对外稳态展示”为优先原则，先改源头，再发布。

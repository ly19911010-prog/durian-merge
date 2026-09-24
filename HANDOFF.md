# HANDOFF — Durian Merge 后续工作清单

> MVP（Web 可玩版本）已完成。本文件记录所有**明确推迟**的功能，
> 按优先级排序。接手时按顺序做即可。

## P0 — 下一版本建议

### 1. Combo / 连击加分系统（已设计，未实现）
- 需求：短时间内连续合成触发连击倍率（如 2 连击 ×1.2、3 连击 ×1.5…）
- 实现位置：`GameScene.doMergeSpawn` 附近加连击计时器（建议窗口 1.5s，
  可配到 `gameConfig.ts` 新增 `combo` 段）
- UI：在分数旁显示 "COMBO x3" 飘字，音效 `sfx.merge` 已支持按 tier 变调，
  可再加连击变调

## P1 — Telegram Mini App 接入

按 `durian_merge_telegram_master_prompt.md`（素材包内）规划：

### 2. Telegram WebApp 基础接入
- `index.html` 引入 `https://telegram.org/js/telegram-web-app.js`
- `Telegram.WebApp.ready()` / `expand()`，视口高度用 `viewportStableHeight`
  替代固定 740（`gameConfig.ts` 的 height 改为动态）
- 主题色：用 `WebApp.themeParams` 微调 UI 配色
- 返回按钮：`WebApp.BackButton` 接管游戏内返回首页

### 3. BotFather 手动步骤（需人工操作，无法自动化）
1. @BotFather → `/newbot` 建机器人（或复用现有 bot）
2. `/newapp` 创建 Mini App，URL 填部署地址（如 Vercel）
3. 拿到 `https://t.me/<bot>/<app>` 分享链接
4. （可选）`/setmenubutton` 配置菜单按钮

### 4. 后端与排行榜（Supabase 或自建 API）
- 用户身份：`Telegram.WebApp.initData` 服务端验签
- 表：`scores(user_id, score, max_tier, created_at)`、`users`
- 客户端：GameScene 结算时 POST 成绩；StartScene 加「排行榜」按钮
- 参考实现：Puppy Wings 项目的 `api/leaderboard.js`（Vercel KV sorted set）
  可直接复用模式

## P2 — 增长与变现

### 5. 分享 / 好友挑战
- `Telegram.WebApp.share` 或复制邀请链接（带 `startapp` 参数）
- 挑战模式：同一随机种子，两人比拼分数

### 6. 广告与 Stars 变现（复用 Puppy Wings 基建）
- AdsGram Reward 广告：复活 / 双倍奖励
- Telegram Stars：复活、皮肤（`Invoice` 流程参考 Puppy Wings）

## P3 — 内容扩展

### 7. 每日挑战
- 按日期种子生成固定掉落序列（mulberry32），全服同一天同一套序列
- Puppy Wings 已有实现可参考

### 8. 成就系统 / 皮肤 / 道具
- 成就：首次合成各等级水果、单局 5000 分等
- 道具：炸弹（清除小水果）、彩虹水果（万能合成）

## 已知限制（MVP）

- 纯前端：最高分只存 localStorage，换设备不保留
- 无暂停时物理步进补偿：切后台过久回来可能状态异常（浏览器自动节流，
  影响较小）
- 大量水果堆叠时低端机可能掉帧（上限 150 已做保护）
- 音效为 WebAudio 合成占位音，可替换为正式音效文件（`sfx.ts` 接口不变，
  内部换成 AudioBuffer 播放即可）

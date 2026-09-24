# 榴莲大作战 · Durian Merge

一款竖屏休闲合成小游戏（Web MVP）：拖动瞄准、松手掉落，相同水果碰撞合成更高级水果，最终目标是合成**榴莲**。

玩法参考「合成大西瓜」，10 级热带水果进化链：龙眼 → 红毛丹 → 青柠 → 山竹 → 椰子 → 柚子 → 芒果 → 火龙果 → 菠萝 → **榴莲**。

## 技术栈

- TypeScript + Vite
- Phaser 3（内置 Matter.js 物理引擎）
- WebAudio 合成音效（无外部音频文件）

## 运行

```bash
npm install
npm run dev      # 本地开发，浏览器打开提示的地址
npm run build    # 类型检查 + 生产构建，产物在 dist/
npm test         # 纯逻辑单元测试（合成/计分/权重/危险线）
npm run preview  # 预览生产构建
```

## 操作

- **拖动 / 移动**：瞄准掉落位置（顶部水果跟随，有瞄准线）
- **松手 / 点击**：掉落水果（有 600ms 冷却）
- **⏸**：暂停 / 继续；**🔊**：声音开关（localStorage 记忆）

## 已完成功能（MVP）

- 开始界面：Logo 位（榴莲图）、Play 按钮、最高分、水果进化链预览
- 游戏主界面：分数 / 最高分 HUD、下一个水果预览、暂停、声音开关
- 水果掉落系统：仅 1–4 级，按权重 [42, 32, 20, 6] 随机
- Matter 物理碰撞：重力 / 弹性 / 摩擦按配置，左右+底部静态墙
- 同水果合成：collisionStart + 逐帧合并队列（高速碰撞不重复合成）
- 10 级升级链 + 合成计分表（10 → 1600）
- **榴莲爆发**：两个榴莲相撞 → +3000 分、冲击波、清除 170px 内 1–4 级水果
- 危险线（y=130）：水果持续 2 秒停留在线上 → 游戏结束（短暂弹跳不计）
- 游戏结束面板：本局得分 / 最高分（localStorage）/ 最高合成水果 / 再来一局 / 返回首页
- 果汁感：合成缩放动画、飘字 "+N"、粒子爆发、按钮按压反馈、WebAudio 音效（掉落 / 合成音调随等级升高 / 按钮 / 结束 / 碰撞闷响 / 爆发）
- 性能保护：存活水果上限 150，粒子发射器复用

## 项目结构

```
src/
  main.ts                 # Phaser Game 启动
  config/
    gameConfig.ts         # ★ 所有调参集中在这里（水果数据/物理/分数/权重/危险线…）
    strings.ts            # 所有中文文案
  audio/
    sfx.ts                # WebAudio 合成音效 + 静音开关
  utils/
    gameLogic.ts          # 纯函数（合成/计分/权重/掉落钳制/危险线），可单元测试
    storage.ts            # localStorage：最高分/静音
  game/
    scenes/
      BootScene.ts        # 预加载 + 粒子纹理生成
      StartScene.ts       # 开始界面
      GameScene.ts        # 核心玩法
    systems/
      background.ts       # 热带背景
      ui.ts               # 按钮组件
      fruitFactory.ts     # 水果实体创建 + 合成弹跳动画
public/assets/fruits/     # 10 个水果 PNG（已压缩至 ≤512px，共 ~1.7MB）
test/run.mjs              # 单元测试（npm test）
```

## 调参

改 `src/config/gameConfig.ts` 即可：水果半径比例、生成权重、合成分数、
物理参数（弹性/摩擦）、危险线位置与时长、掉落冷却、榴莲爆发范围/加分。

## 素材

`public/assets/fruits/` 内图片由原始 1254px 素材压缩至 512px（RGBA 透明背景保留）。
替换素材时保持文件名 `fruit_01_longan.png` … `fruit_10_durian.png` 即可，无需改代码。

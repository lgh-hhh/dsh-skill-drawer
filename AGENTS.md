# 开发约定（给任何接手这个仓库的人或 AI）

本插件曾经因为宿主端漏写 `inject` 把 DSH 进程搞崩（exit 134）。以下规则不是建议，是硬要求。

## 四条硬规则

1. **宿主端**：文件顶部 `export const inject = [...]`，用到的每个 `ctx.X` 都要登记。
   可选服务用 `ctx.inject(['X'], (ctx2) => { ... })`，不要硬注入。
2. **客户端**：工厂返回的 `inject` 写服务名（`['slots']`），不写包名；
   包名只放在 `package.json` 的 `dsh.client.inject`。
3. **不跨作用域引用变量。**
4. **写之前先读真实源码**：`dsh-ide-git/src/index.js`（宿主）、`dshmarket/client/client.js`（前端）。

## 改完必须自检（缺一不可）

```powershell
node --check index.js
node --check client.js
node scripts/smoke.mjs      # 内含“ctx.* 必须登记”的硬检查
```

自检不过，不安装、不提交。

## 安装前

1. 备份 profile：`powershell -ExecutionPolicy Bypass -File scripts\backup-desktop-profile.ps1`
2. 安装后确认返回的 `application` / `warnings`，不靠日志猜测。
3. 出问题：`scripts\rollback-desktop-profile.cmd`。

## 没有构建步骤

`client.js` 就是浏览器加载的源文件，不要引入打包器。

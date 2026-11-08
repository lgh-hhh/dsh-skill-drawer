# 插件接口规则（踩过的坑）

> 这份文件是因为宿主被写崩过一次才有的：`apply` 里读了 `ctx.webServer` 却没声明 inject，
> Cordis 在属性访问层直接抛错，N-API 加载器把它放大成致命错误，整个 DSH 进程 134 退出。
> **try/catch 兜不住**，因为错误发生在代理层，不在你的函数体里。

## 四条硬规则

### 1. 宿主端：用哪个 `ctx.xxx`，就登记哪个

```js
export const inject = ['webServer']
export function apply(ctx) { /* 这里才能读 ctx.webServer */ }
```

没登记就访问 = 启动期崩溃，最坏整个应用起不来。

> 本插件当前宿主半边是**故意空转**的：不 inject、不注册路由、不碰文件。
> 以后要加路由，别挂在 `/api` 下（那属于官方连接层，会先被它吃掉），用 `/dsh-skill-drawer/api/...`。

### 2. 前端端：返回的 `inject` 写**服务名**，不是包名

```js
return { inject: ['slots'], apply(ctx) { /* ctx.slots */ } }
```

包名（`@deepseek-ai/xxx`）只出现在 `package.json` 的 `dsh.client.inject` 里，那是用来排加载顺序的，两处不是一回事。

### 3. 可选的服务不要硬注入

```js
ctx.inject(['settingsScope'], (ctx2) => { /* 有就用，没有就算了 */ })
```

可选服务放进硬 `inject` 会让插件永远等一个不存在的服务；用 `ctx.inject` 则没有也能正常启动。

### 4. 不许跨作用域拿变量

别的函数里的参数、局部变量，出了那个函数就不能用。加载即报 `xxx is not defined`。

## 写之前先看能跑的源码

| 看什么 | 路径 |
| --- | --- |
| 宿主端写法 | `~/.dsh/profiles/desktop/node_modules/dsh-ide-git/src/index.js` |
| 前端端写法 | `~/.dsh/profiles/desktop/node_modules/dshmarket/client/client.js`、`dsh-better-sidebar` |

这些是真实跑通的代码，比我凭记忆写的可靠。

## 改完必须过三步自检

```powershell
node --check index.js
node --check client.js
node scripts/smoke.mjs
```

`smoke.mjs` 里有一条硬检查：扫描源码中所有 `ctx.<service>`，只要有一个没出现在 `inject` 里就直接失败。
**这类错误现在连安装都到不了。**

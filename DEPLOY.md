# 士气工作站部署说明

## Netlify

Build command:

```txt
npm run build
```

Publish directory:

```txt
.
```

Functions directory:

```txt
netlify/functions
```

## 环境变量

必须配置：

```txt
GEMINI_API_KEY=你的 Gemini API Key
```

可选配置：

```txt
GEMINI_MODEL=gemini-2.5-flash
```

API Key 只在 Netlify Function 中读取，不会写入前端页面。

## 本地说明

当前工程是静态页面 + Netlify Function。页面可通过任意静态服务预览；在非 Netlify 本地环境中，Gemini 接口会自动使用模拟结果，方便先检查上传、三阶段进度、完成态编辑、复制、保存和 toast 流程。

## 本地直连线上 Netlify API

可以。本地 `localhost` 页面可以直接调用你部署在 Netlify 的函数，只要该函数允许 CORS。当前函数已经返回：

```txt
Access-Control-Allow-Origin: *
```

本地调真实接口时，在页面地址后追加下面任一参数即可：

```txt
?analyzeApi=https://你的站点.netlify.app/.netlify/functions/analyze-image
```

或：

```txt
?analyzeApiBase=https://你的站点.netlify.app
```

说明：

- 本地 `localhost` / `file://` 下，如果没有传 `analyzeApi` 或 `analyzeApiBase`，页面会继续走 mock 结果。
- 非本地部署环境默认走同源 `/.netlify/functions/analyze-image`。
- 关闭弹窗或重新上传时，请求会自动取消；请求超时会直接报错，不再静默退回 mock。

## 推荐配置方式

如果你准备把前端发布到 GitHub Pages，建议直接在 [src/runtime-config.js](/Users/fileme/Documents/士气工作站%202/src/runtime-config.js:1) 里填入：

```js
window.__WORKSTATION_CONFIG__ = {
  analyzeApiBase: "https://你的站点.netlify.app"
};
```

这样：

- 本地 `http://127.0.0.1:5173/index.html` 会直接调用这个 Netlify API
- 之后发到 GitHub Pages 也会继续调用这个 Netlify API

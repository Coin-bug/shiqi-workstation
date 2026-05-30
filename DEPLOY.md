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

# Site scaffold

这个目录是第一版可部署静态站点骨架。

## 当前结构

- `index.html` 首页
- `logbias/pool/overview.html` 59产品 LOGBIAS 总览
- `logbias/03033/main.html` 3033 主报告
- `logbias/03033/left.html` 3033 左侧优选
- `logbias/03033/trades.html` 3033 交易明细
- `assets/` 对应静态图片

## 本地预览

在本目录运行：

```bash
python3 -m http.server 8000
```

然后打开：

- http://127.0.0.1:8000/

## 部署建议

优先部署到 Cloudflare Pages：
- Build command: 留空
- Output directory: `site`

如果用命令行/上传目录方式部署，直接把 `site/` 作为静态站根目录即可。

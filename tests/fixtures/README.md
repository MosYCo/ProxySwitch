# TLS 测试身份

`health-test.p12` 仅用于 `src-tauri/src/health.rs` 中的本地 HTTPS 证书校验测试。密码为 `caddy-test-only`，密码和测试私钥均有意公开，不包含用户或生产凭据。

测试验证默认校验会拒绝自签名证书，允许跳过校验时才能连接。监听地址使用临时的本机端口，不连接外部服务。

`health-test.p12.sha256` 记录允许公开的这份夹具的哈希。公开内容检查不会忽略其他证书、私钥或整个测试目录。

如需重新生成，安装 OpenSSL 后从项目根目录执行：

```sh
node tests/fixtures/generate-health-test.mjs
```

生成器创建自签名测试证书，SAN 包括 `localhost` 和 `127.0.0.1`，有效期 10 年，随后导出 PKCS#12 并删除临时 PEM。生成后运行 Rust TLS 测试，并同时提交新的夹具与哈希。

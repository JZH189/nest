/**
 * 描述可设置的 Https 选项的接口。
 *
 * @see https://nodejs.org/api/tls.html
 *
 * @publicApi
 */
export interface HttpsOptions {
  /**
   * PFX 或 PKCS12 编码的私钥和证书链。pfx 是单独提供 key 和 cert 的替代方案。
   * PFX 通常是加密的，如果是，将使用密码短语来解密。可以提供多个 PFX，
   * 作为未加密 PFX 缓冲区数组，或对象数组，格式为 {buf: <string|buffer>[, passphrase: <string>]}。
   * 对象形式只能出现在数组中。object.passphrase 是可选的。
   * 如果提供了 object.passphrase，则使用它来解密加密的 PFX，否则使用 options.passphrase。
   */
  pfx?: any;
  /**
   * PEM 格式的私钥。PEM 允许选择加密私钥。加密的密钥将使用 options.passphrase 解密。
   * 可以使用不同算法的多个密钥可以提供为未加密密钥字符串或缓冲区数组，
   * 或对象数组，格式为 {pem: <string|buffer>[, passphrase: <string>]}。
   * 对象形式只能出现在数组中。object.passphrase 是可选的。
   * 如果提供了 object.passphrase，则使用它来解密加密密钥，否则使用 options.passphrase。
   */
  key?: any;
  /**
   * 用于单个私钥和/或 PFX 的共享密码短语。
   */
  passphrase?: string;
  /**
   * PEM 格式的证书链。每个私钥应提供一个证书链。
   * 每个证书链应包括所提供私钥的 PEM 格式证书，后跟 PEM 格式的中间证书（如果有），
   * 按顺序排列，不包括根 CA（根 CA 必须预先被对等方知道，请参见 ca）。
   * 当提供多个证书链时，它们不必与 key 中的私钥顺序相同。
   * 如果未提供中间证书，对等方将无法验证证书，并且握手将失败。
   */
  cert?: any;
  /**
   * 可选地覆盖受信任的 CA 证书。默认为信任 Mozilla 策划的知名 CA。
   * 当使用此选项明确指定 CA 时，MoMozilla 的 CA 将被完全替换。
   * 该值可以是字符串或 Buffer，或字符串和/或 Buffer 的数组。
   * 任何字符串或 Buffer 可以包含多个 PEM CA 连接在一起。
   * 对等方的证书必须可链接到服务器信任的 CA 才能使连接被认证。
   * 当使用不能链接到知名 CA 的证书时，必须将证书的 CA 明确指定为受信任的，
   * 否则连接将无法认证。如果对等方使用的证书与默认 CA 之一不匹配或无法链接，
   * 请使用 ca 选项提供对等方证书可以匹配或链接到的 CA 证书。
   * 对于自签名证书，证书是自己的 CA，必须提供。
   * 对于 PEM 编码的证书，支持的类型为"TRUSTED CERTIFICATE"、"X509 CERTIFICATE"和"CERTIFICATE"。
   * 另请参见 tls.rootCertificates。
   */
  ca?: any;
  /**
   * PEM 格式的 CRL（证书吊销列表）。
   */
  crl?: any;
  /**
   * 密码套件规范，替换默认值。有关更多信息，请参见修改默认密码套件。
   * 可以通过 tls.getCiphers() 获取允许的密码。密码名称必须大写才能被 OpenSSL 接受。
   */
  ciphers?: string;
  /**
   * 尝试使用服务器的密码套件偏好而不是客户端的。
   * 当为 true 时，导致在 secureOptions 中设置 SSL_OP_CIPHER_SERVER_PREFERENCE，
   * 有关更多信息，请参见 OpenSSL 选项。
   */
  honorCipherOrder?: boolean;
  /**
   * 如果为 true，服务器将请求连接客户端的证书并尝试验证该证书。默认：false。
   */
  requestCert?: boolean;
  /**
   * 如果不是 false，服务器将拒绝任何未被提供的 CA 列表授权的连接。
   * 此选项仅在 requestCert 为 true 时有效。默认：true
   */
  rejectUnauthorized?: boolean;
  /**
   * 可能 NPN 协议的数组或缓冲区。（协议应按优先级排序）。
   */
  NPNProtocols?: any;
  /**
   * 如果客户端支持 SNI TLS 扩展，将调用一个函数。调用时将传递两个参数：servername 和 cb。
   * SNICallback 应调用 cb(null, ctx)，其中 ctx 是 SecureContext 实例。
   *（可以使用 tls.createSecureContext(...) 获取适当的 SecureContext。）
   * 如果未提供 SNICallback，将使用带有高级 API 的默认回调。
   */
  SNICallback?: (servername: string, cb: (err: Error, ctx: any) => any) => any;
  /**
   * 可选地影响 OpenSSL 协议行为，这通常不是必需的。
   * 如果需要，应该谨慎使用！该值是 OpenSSL 选项中 SSL_OP_* 选项的数字位掩码。
   */
  secureOptions?: number;
}

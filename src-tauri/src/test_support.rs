use serde_json::Value;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub fn caddy_binary() -> std::path::PathBuf {
    let target = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "caddy-x86_64-pc-windows-msvc.exe",
        ("linux", "x86_64") => "caddy-x86_64-unknown-linux-gnu",
        ("macos", "aarch64") => "caddy-aarch64-apple-darwin",
        ("macos", "x86_64") => "caddy-x86_64-apple-darwin",
        _ => panic!("unsupported Caddy test platform"),
    };
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(target)
}

pub struct Request {
    pub headers: std::collections::BTreeMap<String, String>,
    pub method: String,
    pub path: String,
    pub body: Value,
}
pub struct Server {
    pub address: String,
    pub requests: Arc<Mutex<Vec<Request>>>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
pub async fn server(handler: impl Fn(&Request) -> (u16, Value) + Send + 'static) -> Server {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap().to_string();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let recorded = requests.clone();
    let task = tokio::spawn(async move {
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buffer = Vec::new();
            let header_end = loop {
                let mut chunk = [0u8; 4096];
                let n = stream.read(&mut chunk).await.unwrap();
                if n == 0 {
                    break None;
                }
                buffer.extend_from_slice(&chunk[..n]);
                if let Some(end) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
                    break Some(end + 4);
                }
            };
            let Some(header_end) = header_end else {
                continue;
            };
            let headers = String::from_utf8_lossy(&buffer[..header_end]).to_string();
            let size: usize = headers
                .lines()
                .find_map(|line| {
                    line.to_lowercase()
                        .strip_prefix("content-length:")
                        .map(|v| v.trim().parse().unwrap())
                })
                .unwrap_or(0);
            while buffer.len() < header_end + size {
                let mut chunk = [0u8; 4096];
                let n = stream.read(&mut chunk).await.unwrap();
                if n == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..n]);
            }
            let mut first = headers.lines().next().unwrap().split_whitespace();
            let request = Request {
                headers: headers
                    .lines()
                    .skip(1)
                    .filter_map(|line| line.split_once(':'))
                    .map(|(key, value)| (key.to_ascii_lowercase(), value.trim().to_string()))
                    .collect(),
                method: first.next().unwrap().into(),
                path: first.next().unwrap().into(),
                body: serde_json::from_slice(&buffer[header_end..]).unwrap_or(Value::Null),
            };
            let (code, body) = handler(&request);
            recorded.lock().unwrap().push(request);
            let body = body.to_string();
            stream.write_all(format!("HTTP/1.1 {} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", code, body.len(), body).as_bytes()).await.ok();
        }
    });
    Server {
        address,
        requests,
        task,
    }
}

pub struct Directory(pub std::path::PathBuf);
impl Directory {
    pub fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("caddy-proxy-regression-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        if let (Ok(path), Ok(root)) = (self.0.canonicalize(), std::env::temp_dir().canonicalize()) {
            if path.parent() == Some(root.as_path())
                && path
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("caddy-proxy-regression-")
            {
                let _ = std::fs::remove_dir_all(path);
            }
        }
    }
}
pub struct Process(pub std::process::Child);

/// Reserve a wildcard port, exclusively on Windows where nonexclusive listeners
/// may otherwise overlap and fail to simulate a port conflict.
pub fn occupied_port() -> std::net::TcpListener {
    use socket2::{Domain, Protocol, Socket, Type};
    let (socket, address) = match Socket::new(Domain::IPV6, Type::STREAM, Some(Protocol::TCP)) {
        Ok(socket) => {
            socket.set_only_v6(false).unwrap();
            (socket, std::net::SocketAddr::from(([0u16; 8], 0)))
        }
        Err(_) => (
            Socket::new(Domain::IPV4, Type::STREAM, Some(Protocol::TCP)).unwrap(),
            std::net::SocketAddr::from(([0u8; 4], 0)),
        ),
    };
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawSocket;
        use windows_sys::Win32::Networking::WinSock::{
            setsockopt, SOL_SOCKET, SO_EXCLUSIVEADDRUSE,
        };
        let enabled = 1i32;
        // SAFETY: socket owns a valid Winsock socket and the option points to an
        // initialized integer for the entire synchronous setsockopt call.
        let result = unsafe {
            setsockopt(
                socket.as_raw_socket() as _,
                SOL_SOCKET,
                SO_EXCLUSIVEADDRUSE,
                &enabled as *const i32 as *const u8,
                std::mem::size_of_val(&enabled) as i32,
            )
        };
        assert_eq!(result, 0, "failed to reserve an exclusive test port");
    }
    socket.bind(&address.into()).unwrap();
    socket.listen(128).unwrap();
    socket.into()
}

impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

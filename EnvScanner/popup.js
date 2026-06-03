document.addEventListener('DOMContentLoaded', async () => {
    // 1. 全局硬件与网络指纹
    renderGlobalFingerprint();
    // 2. 真实 HTTP 请求头 (带超时与兜底)
    renderHttpHeaders();
    // 3. 当前页面缓存
    renderPageFingerprint();
});

// ==========================================
// 1. 全局网络与硬件指纹
// ==========================================
function getWebRTCIPs() {
    return new Promise((resolve) => {
        const ips = new Set();
        const rtc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        rtc.createDataChannel("");
        rtc.onicecandidate = (event) => {
            if (event.candidate) {
                const match = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/i.exec(event.candidate.candidate);
                if (match) ips.add(match[1]);
            }
        };
        rtc.createOffer().then(offer => rtc.setLocalDescription(offer)).catch(() => {});
        setTimeout(() => {
            rtc.close();
            resolve(ips.size > 0 ? Array.from(ips).join('\n') : "未检测到泄漏");
        }, 1500);
    });
}

async function renderGlobalFingerprint() {
    const container = document.getElementById('global-fp-list');
    container.innerHTML = '<div class="data-item"><div class="data-label">正在探测深层网络...</div></div>';

    let ipv4 = "获取中...", ipv6 = "获取中...", webrtcIps = "获取中...";
    try {
        const [v4, v6, rtc] = await Promise.all([
            fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => d.ip).catch(() => '无 IPv4'),
            fetch('https://api64.ipify.org?format=json').then(r => r.json()).then(d => d.ip).catch(() => '未获取到'),
            getWebRTCIPs()
        ]);
        ipv4 = v4;
        ipv6 = (v6 === v4) ? "当前网络无 IPv6" : v6;
        webrtcIps = rtc;
    } catch (e) {}

    function getCanvasHash() {
        const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
        ctx.textBaseline = "top"; ctx.font = "14px 'Arial'"; ctx.fillStyle = "#f60"; ctx.fillRect(125,1,62,20);
        ctx.fillStyle = "#069"; ctx.fillText("Global Fingerprint", 2, 15);
        return canvas.toDataURL().slice(-40); 
    }

    function getWebGLInfo() {
        try {
            const gl = document.createElement('canvas').getContext('webgl');
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return `${gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)}\n${gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)}`;
        } catch (e) { return "获取失败"; }
    }

    container.innerHTML = '';
    [
        { label: "📍 基础公网出口 (IPv4)", value: ipv4 },
        { label: "📍 现代网络出口 (IPv6)", value: ipv6 },
        { label: "⚠️ WebRTC 底层泄漏 IP", value: webrtcIps },
        { label: "🖥️ 显卡型号 (WebGL)", value: getWebGLInfo() },
        { label: "🎨 绘图特征码 (Canvas)", value: getCanvasHash() },
        { label: "⚙️ 屏幕与 CPU", value: `分辨率 ${screen.width}x${screen.height} | CPU ${navigator.hardwareConcurrency || "?"} 核` }
    ].forEach(item => {
        container.innerHTML += `<div class="data-item"><div class="data-label">${item.label}</div><div class="data-value" style="white-space: pre-wrap;">${item.value}</div></div>`;
    });
}

// ==========================================
// 2. 真实 HTTP 请求头 (双保险：超时控制 + 本地兜底)
// ==========================================
async function renderHttpHeaders() {
    const container = document.getElementById('http-headers-list');
    container.innerHTML = '<div class="data-item"><div class="data-label">正在拦截请求头数据...</div></div>';

    try {
        // 设置 3 秒超时限制，防止一直卡着
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        // 换成 postman 的回显接口
        const res = await fetch('https://postman-echo.com/headers', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await res.json();
        const headers = data.headers;
        
        container.innerHTML = '';
        const ignoreKeys = ['host', 'x-forwarded-port', 'x-forwarded-proto']; 
        
        for (const [key, value] of Object.entries(headers)) {
            if (!ignoreKeys.includes(key)) {
                container.innerHTML += `
                    <div class="data-item">
                        <div class="data-label">${key}</div>
                        <div class="data-value">${value}</div>
                    </div>`;
            }
        }
    } catch (e) {
        // 如果接口依然超时或被阻断，直接用本地原生 API 提取核心头信息（永远不失败）
        container.innerHTML = '<div class="data-item"><div class="data-label" style="color:#ffb74d;">远程接口超时，已自动切换至本地探针提取：</div></div>';
        
        const localHeaders = {
            "user-agent": navigator.userAgent,
            "accept-language": navigator.language,
            "sec-ch-ua": navigator.userAgentData ? navigator.userAgentData.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ') : "不支持 Client Hints",
            "sec-ch-ua-mobile": navigator.userAgentData ? (navigator.userAgentData.mobile ? "?1" : "?0") : "?0",
            "sec-ch-ua-platform": navigator.userAgentData ? `"${navigator.userAgentData.platform}"` : "未知"
        };

        for (const [key, value] of Object.entries(localHeaders)) {
            container.innerHTML += `
                <div class="data-item">
                    <div class="data-label">${key}</div>
                    <div class="data-value">${value}</div>
                </div>`;
        }
    }
}

// ==========================================
// 3. 当前页面指纹 (Local)
// ==========================================
async function renderPageFingerprint() {
    const container = document.getElementById('page-fp-list');
    const domainInfo = document.getElementById('page-domain-info');

    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    let currentTab = tabs[0];

    if (!currentTab || !currentTab.url || !currentTab.url.startsWith('http')) {
        domainInfo.textContent = "⚠️ 请在普通网页中使用以读取缓存";
        return;
    }

    domainInfo.textContent = `当前站点: ${new URL(currentTab.url).hostname}`;

    chrome.cookies.getAll({ url: currentTab.url }, (cookies) => {
        let text = cookies.length ? cookies.map(c => `${c.name}: ${c.value.length > 30 ? c.value.substring(0,30)+'...' : c.value} ${c.httpOnly ? '[HttpOnly]' : ''}`).join('\n') : "空";
        container.innerHTML += `<div class="data-item"><div class="data-label">🍪 Cookies (${cookies.length} 项)</div><div class="data-value">${text}</div></div>`;
    });

    chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => {
            const formatStr = (s) => Object.entries(s).length ? Object.entries(s).map(([k,v]) => `${k}: ${v.length>30?v.substring(0,30)+'...':v}`).join('\n') : "空";
            return { lCount: localStorage.length, lStr: formatStr(localStorage), sCount: sessionStorage.length, sStr: formatStr(sessionStorage) };
        }
    }, (results) => {
        if (results && results[0]) {
            const d = results[0].result;
            container.innerHTML += `<div class="data-item"><div class="data-label">📦 LocalStorage (${d.lCount} 项)</div><div class="data-value">${d.lStr}</div></div>`;
            container.innerHTML += `<div class="data-item"><div class="data-label">⏳ SessionStorage (${d.sCount} 项)</div><div class="data-value">${d.sStr}</div></div>`;
        }
    });
}
document.getElementById('extractBtn').addEventListener('click', async () => {
  const resultDiv = document.getElementById('result');
  resultDiv.innerText = "正在提取中...";

  // 1. 获取当前你正在看的那个标签页
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // 2. 利用 scripting 权限，把我们写的函数强行注入到那个网页里去执行
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: getImagesFromPage,
  }, (injectionResults) => {
    // 3. 拿到网页里 return 回来的结果并显示在小窗口上
    const urls = injectionResults[0].result;
    
    if (urls && urls.length > 0) {
      resultDiv.innerHTML = `<strong>✅ 共找到 ${urls.length} 张图片：</strong><br><br>`;
      urls.forEach(url => {
        resultDiv.innerHTML += `<div class="url-item"><a href="${url}" target="_blank">${url}</a></div>`;
      });
    } else {
      resultDiv.innerText = "❌ 当前网页未找到有效图片。";
    }
  });
});

// 这个函数不会在插件本身执行，而是被“传送”到当前打开的网页里执行
function getImagesFromPage() {
  let imgs = document.querySelectorAll('img');
  let urls = [];
  
  for (let img of imgs) {
    // 浏览器会自动把 src 补全为绝对路径 (http...)
    // 兼容带有 data-src 懒加载的图片
    let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
    
    // 过滤掉空的，以及 base64 格式的小图标
    if (src && !src.startsWith('data:image')) {
      urls.push(src);
    }
  }
  
  // 使用 Set 去重，然后转回数组返回
  return [...new Set(urls)];
}
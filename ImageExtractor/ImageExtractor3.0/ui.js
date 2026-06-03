// 1. 全局记忆池：只要抓到过的链接，永远存放在这里，防止被网页销毁
let globalUrlsSet = new Set(); 
let autoScrapeInterval = null; // 自动滚动的定时器
let isAutoScraping = false;    // 当前是否正在抓取的状态标志

let panelElement = null;
let resultContainer = null;
let statusEl = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggle_panel") {
        if (!panelElement) {
            createAndInjectPanel();
        } else {
            togglePanelVisibility();
        }
    }
});

function closePanel() {
    if (panelElement) panelElement.style.display = 'none';
    if (isAutoScraping) stopScraping(); // 关闭面板时自动停止抓取
}

function togglePanelVisibility() {
    panelElement.style.display = panelElement.style.display === 'none' ? 'block' : 'none';
}

function createAndInjectPanel() {
    panelElement = document.createElement('div');
    panelElement.id = 'img-scraper-panel';
    panelElement.className = 'img-scraper-fixed-panel';
    panelElement.style.display = 'block';

    // 界面更新：抓取按钮默认变成“▶ 开始自动抓取”
    panelElement.innerHTML = `
        <div class="scraper-header">
            <button id="extract-btn" class="main-action-btn" style="background-color: #ff9800;">▶ 开始自动抓取</button>
            <button id="select-all-btn" class="action-btn" style="display: none;">全选</button>
            <button id="invert-btn" class="action-btn" style="display: none;">反选</button>
            <button id="download-btn" class="action-btn" style="display: none; background-color: #28a745;">下载已选</button>
            <span id="scraper-status">等待抓取</span>
            <div id="close-x-btn" title="隐藏面板">×</div>
        </div>
        <div id="scraper-result-container"></div>
    `;

    document.body.appendChild(panelElement);

    resultContainer = panelElement.querySelector('#scraper-result-container');
    statusEl = panelElement.querySelector('#scraper-status');

    panelElement.querySelector('#close-x-btn').addEventListener('click', closePanel);
    panelElement.querySelector('#extract-btn').addEventListener('click', toggleScraping);
    panelElement.querySelector('#select-all-btn').addEventListener('click', handleSelectAll);
    panelElement.querySelector('#invert-btn').addEventListener('click', handleInvert);
    panelElement.querySelector('#download-btn').addEventListener('click', handleDownload);
}

// 2. 核心控制：开始与停止逻辑
function toggleScraping() {
    const extractBtn = panelElement.querySelector('#extract-btn');
    const downloadBtn = panelElement.querySelector('#download-btn');
    const selectAllBtn = panelElement.querySelector('#select-all-btn');
    const invertBtn = panelElement.querySelector('#invert-btn');

    if (isAutoScraping) {
        // 如果正在抓取，则停止
        stopScraping();
    } else {
        // 如果没有抓取，则开始
        isAutoScraping = true;
        extractBtn.textContent = "⏹ 停止抓取";
        extractBtn.style.backgroundColor = "#dc3545"; // 变成红色警示按钮
        
        // 显示操作按钮
        downloadBtn.style.display = 'inline-block'; 
        selectAllBtn.style.display = 'inline-block';
        invertBtn.style.display = 'inline-block';

        statusEl.textContent = "启动自动滚屏...";
        
        // 每隔 800 毫秒执行一次抓取和向下滚动
        autoScrapeInterval = setInterval(scrapeStep, 800);
        scrapeStep(); // 立即执行第一次
    }
}

function stopScraping() {
    isAutoScraping = false;
    clearInterval(autoScrapeInterval);
    const extractBtn = panelElement.querySelector('#extract-btn');
    extractBtn.textContent = "▶ 继续滚屏抓取";
    extractBtn.style.backgroundColor = "#ff9800"; // 恢复橙色
    statusEl.textContent = `已暂停，记忆池共 ${globalUrlsSet.size} 张`;
    updateSelectedCount();
}

// 3. 单次抓取与滚屏逻辑
function scrapeStep() {
    const images = document.querySelectorAll('img');
    let newlyAddedCount = 0;

    images.forEach(img => {
        // 排除插件面板自己的图片
        if (img.closest('#img-scraper-panel')) return;

        // 提取链接
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original'); 
        
        // 如果是有效链接，且全局记忆池里【没有】这张图，才添加！
        if (src && src.startsWith('http') && !globalUrlsSet.has(src)) {
            globalUrlsSet.add(src);
            newlyAddedCount++;
            
            // 实时把新图片渲染到面板上
            renderSingleImage(src);
        }
    });

    // 模拟真人向下缓慢滚动屏幕 (每次向下滚 600 像素)
    window.scrollBy({
        top: 600,
        behavior: 'smooth'
    });

    statusEl.textContent = `滚屏抓取中... 记忆池已存 ${globalUrlsSet.size} 张`;
    updateSelectedCount();

    // 触底自动停止判定：如果滚动到底部了，自动停止
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 10) {
        stopScraping();
        statusEl.textContent = `已到底部，共抓取 ${globalUrlsSet.size} 张`;
    }
}

// 4. 将单张图片渲染到界面上（增量渲染，不卡顿）
function renderSingleImage(url) {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper selected'; 

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'image-checkbox';
    checkbox.value = url;
    checkbox.checked = true; // 新抓到的图默认勾选

    const imgElement = document.createElement('img');
    imgElement.src = url;
    imgElement.className = 'preview-image';
    imgElement.title = '点击切换选中状态';

    wrapper.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        wrapper.classList.toggle('selected', checkbox.checked);
        updateSelectedCount();
    });

    wrapper.appendChild(checkbox);
    wrapper.appendChild(imgElement);
    resultContainer.appendChild(wrapper); // 直接追加到末尾，不影响前面的图片
}

// 5. 辅助功能（全选/反选/更新计数）
function handleSelectAll() {
    resultContainer.querySelectorAll('.image-wrapper').forEach(wrapper => {
        wrapper.classList.add('selected');
        wrapper.querySelector('.image-checkbox').checked = true;
    });
    updateSelectedCount();
}

function handleInvert() {
    resultContainer.querySelectorAll('.image-wrapper').forEach(wrapper => {
        const checkbox = wrapper.querySelector('.image-checkbox');
        checkbox.checked = !checkbox.checked;
        wrapper.classList.toggle('selected', checkbox.checked);
    });
    updateSelectedCount();
}

function updateSelectedCount() {
    const selectedCount = resultContainer.querySelectorAll('.image-checkbox:checked').length;
    statusEl.textContent = `已选 ${selectedCount} / ${globalUrlsSet.size} 张`;
}

// 6. 下载逻辑（保持不变）
async function handleDownload() {
    const selectedCheckboxes = Array.from(resultContainer.querySelectorAll('.image-checkbox:checked'));
    const urlsToDownload = selectedCheckboxes.map(cb => cb.value);

    if (urlsToDownload.length === 0) {
        statusEl.textContent = "请至少选择一张图片";
        return;
    }

    try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        let savedCount = 0;

        for (let i = 0; i < urlsToDownload.length; i++) {
            const url = urlsToDownload[i];
            statusEl.textContent = `正在保存 (${savedCount}/${urlsToDownload.length})...`;
            
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('网络请求失败');
                const blob = await response.blob();

                let fileName = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
                fileName = decodeURIComponent(fileName).replace(/[\\/:*?"<>|]/g, '_');
                if (!fileName || !fileName.includes('.')) {
                    const ext = blob.type.split('/')[1] || 'jpg';
                    fileName = `image_${i + 1}.${ext}`;
                }

                const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();

                savedCount++;
            } catch (err) {
                console.error(`保存失败: ${url}`, err);
            }
        }
        statusEl.textContent = `成功保存 ${savedCount} 张图片！`;
    } catch (error) {
        console.log('用户取消了操作或授权失败', error);
        updateSelectedCount(); 
    }
}
let currentImageUrls = [];

document.getElementById('extract-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('status');
    const container = document.getElementById('result-container');
    const downloadBtn = document.getElementById('download-btn');
    const selectAllBtn = document.getElementById('select-all-btn');
    const invertBtn = document.getElementById('invert-btn');
    
    statusEl.textContent = "正在抓取...";
    container.innerHTML = ''; 
    downloadBtn.style.display = 'none'; 
    selectAllBtn.style.display = 'none';
    invertBtn.style.display = 'none';
    currentImageUrls = []; 
    
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: extractImagesFromPage,
    }, (results) => {
        if (chrome.runtime.lastError) {
            statusEl.textContent = "抓取失败";
            return;
        }

        if (results && results[0] && results[0].result) {
            currentImageUrls = results[0].result;
            
            if (currentImageUrls.length === 0) {
                statusEl.textContent = '';
                container.innerHTML = '<div class="empty-msg">当前页面未检测到图片</div>';
                return;
            }

            statusEl.textContent = `共抓取 ${currentImageUrls.length} 张`;
            
            // 显示所有操作按钮
            downloadBtn.style.display = 'inline-block'; 
            selectAllBtn.style.display = 'inline-block';
            invertBtn.style.display = 'inline-block';

            currentImageUrls.forEach((url, index) => {
                // 创建包裹层
                const wrapper = document.createElement('div');
                wrapper.className = 'image-wrapper selected'; // 默认全选状态

                // 创建复选框
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'image-checkbox';
                checkbox.value = url;
                checkbox.checked = true; // 默认打勾

                // 创建图片
                const imgElement = document.createElement('img');
                imgElement.src = url;
                imgElement.className = 'preview-image';
                imgElement.title = '点击切换选中状态';

                // 点击整个容器，切换选中状态（不用费力点小方框）
                wrapper.addEventListener('click', () => {
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) {
                        wrapper.classList.add('selected');
                    } else {
                        wrapper.classList.remove('selected');
                    }
                    updateSelectedCount();
                });

                wrapper.appendChild(checkbox);
                wrapper.appendChild(imgElement);
                container.appendChild(wrapper);
            });
            
            updateSelectedCount();
        }
    });
});

// 全选按钮逻辑
document.getElementById('select-all-btn').addEventListener('click', () => {
    document.querySelectorAll('.image-wrapper').forEach(wrapper => {
        wrapper.classList.add('selected');
        wrapper.querySelector('.image-checkbox').checked = true;
    });
    updateSelectedCount();
});

// 反选按钮逻辑
document.getElementById('invert-btn').addEventListener('click', () => {
    document.querySelectorAll('.image-wrapper').forEach(wrapper => {
        const checkbox = wrapper.querySelector('.image-checkbox');
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
            wrapper.classList.add('selected');
        } else {
            wrapper.classList.remove('selected');
        }
    });
    updateSelectedCount();
});

// 动态更新右上角状态文字（显示已选了几张）
function updateSelectedCount() {
    const selectedCount = document.querySelectorAll('.image-checkbox:checked').length;
    document.getElementById('status').textContent = `已选 ${selectedCount} / ${currentImageUrls.length} 张`;
}

// 下载按钮逻辑
document.getElementById('download-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('status');
    
    // 核心修改：只获取被勾选的复选框对应的 url
    const selectedCheckboxes = Array.from(document.querySelectorAll('.image-checkbox:checked'));
    const urlsToDownload = selectedCheckboxes.map(cb => cb.value);

    if (urlsToDownload.length === 0) {
        statusEl.textContent = "请至少选择一张图片";
        return;
    }

    try {
        const dirHandle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });

        statusEl.textContent = "准备下载...";
        let savedCount = 0;

        // 遍历需要下载的图片（urlsToDownload 而不是 currentImageUrls）
        for (let i = 0; i < urlsToDownload.length; i++) {
            const url = urlsToDownload[i];
            statusEl.textContent = `正在保存 (${savedCount}/${urlsToDownload.length})...`;
            
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('网络响应错误');
                const blob = await response.blob();

                let fileName = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
                fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
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
        console.log('用户取消了操作', error);
        updateSelectedCount(); // 恢复状态文字
    }
});

function extractImagesFromPage() {
    const images = document.querySelectorAll('img');
    const urls = new Set(); 
    
    images.forEach(img => {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original'); 
        if (src && src.startsWith('http')) {
            urls.add(src);
        }
    });
    
    return Array.from(urls);
}
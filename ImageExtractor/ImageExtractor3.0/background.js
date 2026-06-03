// 监听浏览器右上角插件图标的点击事件
chrome.action.onClicked.addListener((tab) => {
    // 向当前活跃网页发送消息，通知其“打开或关闭面板”
    chrome.tabs.sendMessage(tab.id, { action: "toggle_panel" }).catch(err => {
        console.log("当前页面可能尚未加载完毕，或不支持注入扩展界面", err);
    });
});
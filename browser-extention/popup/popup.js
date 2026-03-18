document.addEventListener("DOMContentLoaded", () => {
    const countInput = document.getElementById("craw-countThumb");
    const crawlBtn = document.getElementById("craw-button");
    const statusText = document.getElementById("craw-status");
    const MAX = 9999;

    if (!countInput || !crawlBtn || !statusText) {
        console.error("Popup elements not found");
        return;
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (!message || !message.type) return;

        if (message.type === "CRAWL_ERROR") {
            console.error("Crawl error:", message.error);
            statusText.textContent = "Crawl error!";
            crawlBtn.disabled = false;
        }

        if (message.type === "PRODUCT_PROGRESS") {
            statusText.textContent = `Collected: ${message.total}`;
        }

        if (message.type === "CRAWL_FINISHED") {
            statusText.textContent = "Crawling Successfully";
            crawlBtn.disabled = false;
        }
    });
    
    crawlBtn.addEventListener("click", async () => {
        let count = parseInt(countInput.value);

        if (isNaN(count) || count <= 0) {
            statusText.textContent = "Please enter a valid number";
            return;
        }

        if (count > MAX) count = MAX;

        statusText.textContent = `Status: crawling products 0 -> ${count}`;
        crawlBtn.disabled = true;

        try {
            const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            if (!tabs || tabs.length === 0) {
                statusText.textContent = "No active tab";
                crawlBtn.disabled = false;
                return;
            }

            const tab = tabs[0];
            const url = new URL(tab.url);

            if (url.hostname !== "etsy.toidispy.com") {
                statusText.textContent = "Please open an Etsy page first";
                crawlBtn.disabled = false;
                return;
            }

            chrome.runtime.sendMessage({
                type: "START_CRAWL",
                delay: 500,
                count: count,
                tabId: tab.id
            }, (response) => {

                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    statusText.textContent = "Cannot connect to background";
                    crawlBtn.disabled = false;
                    return;
                }

                if (!response) {
                    statusText.textContent = "No response from background";
                    crawlBtn.disabled = false;
                    return;
                }

                if (response.success) {
                    statusText.textContent = "Crawl started...";
                } else {
                    statusText.textContent = "Crawl failed!";
                    crawlBtn.disabled = false;
                }
            });

        } catch (error) {
            console.error(error);
            statusText.textContent = "Error Happened";
            crawlBtn.disabled = false;
        }
    });
});
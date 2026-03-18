import { saveProducts } from "../utils/api.js";
let products = [];
let isCrawling = false;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if(message.type === "START_CRAWL") {
        const { count, delay, tabId } = message;
        console.log("Start crawling: " , count);

        if (isCrawling) {
            sendResponse({ success: false, error: "Already crawling" });
            return;
        }

        if (!tabId) {
            sendResponse({ success: false, error: "No tabId" });
            isCrawling = false;
            return;
        }
     
        isCrawling = true;
        products = [];

        chrome.scripting.executeScript({
            target: { tabId },
            files: ["content/content.js"]
        }, async () => {

            if(chrome.runtime.lastError) {
                console.error("Inject error:", chrome.runtime.lastError.message);
                isCrawling = false;
                sendResponse({success: false});
                return
            }
            else {
                sendResponse({success: true});
            }

            await new Promise(r => setTimeout(r, 200));

            chrome.tabs.sendMessage(tabId, {
                type: "CRAWL_PRODUCTS",
                count,
                delay
            }, () => {
                if(chrome.runtime.lastError) {
                    console.error("Send message error:", chrome.runtime.lastError.message)
                    isCrawling = false;
                    sendResponse({ success: false });
                } else {
                    sendResponse({ success: true });
                }
            });
        });
        return true;
    }
    if(message.type === "PRODUCT_DATA") {
        const newProducts = message.products;
        if(!newProducts) return;
        console.log("Product received: ", newProducts.length);
      
        products.push(...newProducts);
        chrome.runtime.sendMessage({
            type: "PRODUCT_PROGRESS",
            total: products.length
        });
    }
    if(message.type == "CRAWL_FINISHED") {
        console.log("Sending to server: ", products.length);
        isCrawling = false;
        sendToServer(products);
        chrome.runtime.sendMessage({
            type: "CRAWL_FINISHED",
        });
    }
    if(message.type === "CRAWL_ERROR") {
        console.error("Crawl error from content script:", message.error);
        isCrawling = false;
        chrome.runtime.sendMessage({
            type: "CRAWL_ERROR",
            error: message.error
        });
    }
});

async function sendToServer(products) {
    if(products.length <= 0) {
        console.log("No data");
        return;
    }
    const unique = new Map();
    products.forEach(p => {
        if (p.link) unique.set(p.link, p);
    });
    const finalData = Array.from(unique.values());
    await saveProducts(finalData);
}

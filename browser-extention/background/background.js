import { saveProducts } from "../utils/api.js";

let isCrawling = false;

chrome.runtime.onMessage.addListener( async (message, sender, sendResponse) => {
    if (message.type === "PRODUCT_DATA") {
        if (isCrawling) {
            sendResponse({ success: false, error: "Already crawling" });
            return;
        }
        isCrawling = true;
        try {
            const products = message.products || [];

            console.log("Saving products:", products.length);

            await saveProducts(message.products || []);
            chrome.runtime.sendMessage({
                type: "CRAWL_FINISHED",
                total: products.length
            });
            sendResponse({ success: true });

        } catch (err) {
            console.error("Error saving products:", err);
            chrome.runtime.sendMessage({
                type: "CRAWL_ERROR",
                error: err.message
            });
            sendResponse({ success: false, error: err.message });
        } finally {
            isCrawling = false;
        }
        return true;
    }
});

 


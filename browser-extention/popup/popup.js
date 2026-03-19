const crawlBtn = document.getElementById("craw-button");
const crawlInput = document.getElementById("craw-input")
const statusText = document.getElementById("craw-status");

function sendMessagePromise(message) {
    return new Promise(async (resolve, reject) => {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0]) return reject(new Error("No active tab"));
            if (!tabs[0].url.startsWith("https://etsy.toidispy.com/listings")) {
                return reject(new Error("Please navigate to https://etsy.toidispy.com/ to use this extension."));
            }
            chrome.tabs.sendMessage(tabs[0].id, message, (res) => {
                if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                resolve(res);
            });
        } catch (err) {
            reject(err);
        }
    });
}
crawlBtn.addEventListener("click", async() => {
    const count = parseInt(crawlInput.value);
    if (!count || count <= 0) {
        statusText.textContent = "Status: Please enter a valid number!";
        return;
    }

    try {
        crawlBtn.disabled = true;
        statusText.textContent = "Status: Crawling...";
        const res = await sendMessagePromise({
            type : "FETCH_PRODUCTS",
            count,
        });
        if (!res || !res.success) {
            const errorMessage = res?.error?.message || res?.error || "Unknow error";
            throw new Error(errorMessage);
        }
        console.log("RESULT:", res);

        const products = res.products || [];
        statusText.textContent = `Status: Done(${products.length || 0} products)`;
    } catch (error) {
        console.error(error);
        statusText.textContent = `Status: Error - ${error.message || 'Unknown error'}`;
    }
    finally {
        crawlBtn.disabled = false;
    }
    
})
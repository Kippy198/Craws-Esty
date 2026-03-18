    function getProduct() {
        return document.querySelectorAll(".p-item-col[data-id]");
    }

    function getProductDetail(products) {
        try {
            const listTitle = products.querySelector(".listing-title a");
            const name = listTitle?.innerText?.trim() || null;
            const link = listTitle?.href || null;
            
            let img = null
            const imgDiv = products.querySelector(".p-carousel-item-img");
            if(imgDiv){
                const style = window.getComputedStyle(imgDiv).backgroundImage;
                const match = style.match(/url\(["']?(.*?)["']?\)/);
                img = match ? match[1] : null
            }

            const category = new URL(location.href).searchParams.get("category") || null;

            return {
                name,
                img,
                category,
                link
            }
        } catch (error) {
            console.error("Error in getProductDetail:", error);
            return null;
        }
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    } 

    async function waitForNewItems(prevCount, timeOut = 3000) {
        const start = Date.now();
        while( Date.now() - start < timeOut) {
            const current = getProduct().length;
            if(current !== prevCount) return true;

            await sleep(200);
        }
        return false;
    } 

    async function autoScrollAndCollection(target,delay) {
        const collected = new Map();
        
        let lastSize = 0; /*gia tri lan lap trc*/
        let stable = 0; /* so lan ko thay doi du lieu*/
        const MAX_STABLE = 5;
        
        try {
            while ( true ) {
                const items = Array.from(getProduct());
                items.forEach(item => {
                    const p = getProductDetail(item);
                    if(p && p.link) {
                        collected.set(p.link, p);
                    }
                })

                console.log("Collected:", collected.size);
                
                if(collected.size >= target) break;

                const prevCount = items.length;
                const beforeSize = collected.size;

                window.scrollBy(0, 300 + Math.random() * 300);
                const hasNew = await waitForNewItems(prevCount,delay);
                    
                const newItems = Array.from(getProduct());
                newItems.forEach(item => {
                    const p = getProductDetail(item);
                    if (p && p.link) {
                        collected.set(p.link, p);
                    }
                });
                const afterSize = collected.size;

                
                if(!hasNew && afterSize === beforeSize){
                        stable++;
                        console.log("Stable:", stable);
                    } else {
                        stable = 0;
                    }

                    if(stable >= MAX_STABLE) {
                        console.log("End of data");
                        break;
                    }
                    await sleep(800 + Math.random() * 500);
            }
            return Array.from(collected.values());
        } catch (error) {
            console.error("Error in autoScroll:", error);
            throw error;
        }
    }

    async function startCrawl({count, delay}) {
        try {
            console.log("Start:",  count);
            const target = count;

            const allProducts = await autoScrollAndCollection(target, delay);

            if(allProducts.length === 0) {
                console.warn("Can't get products");
                chrome.runtime.sendMessage({type : "CRAWL_FINISHED"});
                return;
            }

            const final = allProducts.slice(0, count);
            console.log('Final products:', final.length);
            sendProducts(final);

            chrome.runtime.sendMessage({
                type: "CRAWL_FINISHED"
            });

        } catch (error) {
            console.error("Error in startCrawl:", error);

            chrome.runtime.sendMessage({
                type: "CRAWL_ERROR",
                error: error.message
            });
        }
    }
    function sendProducts(products) {
        try {
            chrome.runtime.sendMessage({
                type: "PRODUCT_DATA",
                products: products,
            });
        } catch (error) {
            console.error("Error sending products:", error);
        }
    }
   

chrome.runtime.onMessage.addListener((message,sender,sendResponse) => {
    if(message.type === "CRAWL_PRODUCTS") {
        startCrawl(message);
    }
})
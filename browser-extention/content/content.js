

    function getProduct() {
        return document.querySelectorAll(".p-item-col[data-id]");
    }

    function getProductDetail(products) {
        try {
            const listTitle = products.querySelector(".listing-title a");
            const id = products.getAttribute("data-id")
            const name = listTitle?.innerText?.trim() || null;
            const link = listTitle?.href || null;
            
            let img = null
            const imgDiv = products.querySelector(".p-carousel-item-img");
            if(imgDiv){
                const style = window.getComputedStyle(imgDiv).backgroundImage;
                const match = style.match(/url\(["']?(.*?)["']?\)/);
                img = match ? match[1] : null
            }
            return {
                id,
                name,
                img,
                link
            }
        } catch (error) {
            console.error("Error in getProductDetail:", error);
            return null;
        }
    }

    async function sendToServer(products) {
        if(products.length <= 0) {
            console.log("No data");
            return;
        }
        const unique = new Map();
        products.forEach( (p) => {
            if (p.id) unique.set(p.id, p);
        });

        const finalData = Array.from(unique.values());

        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: "PRODUCT_DATA", products: finalData }, (resp) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve(resp);
            });
        });
    }

    async function fetchProducts(limit) {
        let products = [];
        let cursor = '';

        const token = localStorage.getItem("accessToken");

        while(products.length < limit) {
            const url = `https://es-api.toidispy.com/listings?limit=${limit-products.length}&cursor=${cursor}&version=v1.2`;
            console.log("API URL:",url);
            const headers = {
                "Content-Type": "application/json",
                "Origin": location.origin,
                "Referer": location.href
            };
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }
            const res = await fetch(url, { headers });
            const data = await res.json();

            if(!data?.data?.length) break;

            products.push(
                ...data.data.map((item) => ({
                    id: item._id,
                    title: item.title,
                    link: item.url || null,
                    pictures: {
                        thumb: item.pictures?.thumb || null,
                        large: item.pictures?.large || null,
                        original: item.pictures?.original || null,   
                    },
                }))
            );

            cursor = data.next_cursor;
            if(!cursor) break;
        }
        return products.slice(0, limit);
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

    async function autoScrollAndCollection(target,delay = 2000) {
        const collected = new Map();
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
                });

                if(collected.size >= target) break;
                console.log("Collected:", collected.size);
                
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
            return Array.from(collected.values()).slice(0,target);
        } catch (error) {
            console.error("Error in autoScroll:", error);
            throw error;
        }
    }

    async function CrawlProductsWithApi(products) {
        const token = localStorage.getItem("accessToken");
        if(!token) {
            console.log("Cant find token");
            return;
        }

        const productsWithApi = await Promise.all(products.map( async p => {
            try {
                const res = await fetch(
                `https://es-api.toidispy.com/listings/insight?id=${p.id}&version=v1.2`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                        "Origin": location.origin,
                        "Referer": location.href
                    }
                }
                )
                const data = await res.json();
                const breadcrumb = data?.info?.breadcrumb || [];
                const category = breadcrumb.map(b => b.name).join(" > ");
                return { ...p, category };
            } catch (error) {
                console.error("Insight API error", p.id, error);
                return { ...p, category: null };
            }
        })) ;
        return productsWithApi;
    }

    async function startCrawl({count, delay}) {
        try {
            const allProducts = await autoScrollAndCollection(count, delay);

            if(allProducts.length === 0) {
                console.warn("Can't get products");
                chrome.runtime.sendMessage({type : "CRAWL_FINISHED"});
                return;
            }

            const productsApi = await CrawlProductsWithApi(allProducts);

            chrome.runtime.sendMessage({
                type: "PRODUCT_DATA",
                products: productsApi,
            })
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
    };

    if (message.type === "FETCH_PRODUCTS") {
        (async () => {
            try {
                const products = await autoScrollAndCollection(message.count);
                const productsWithApi = await CrawlProductsWithApi(products);
                await sendToServer(productsWithApi); 
                sendResponse({ success: true, products: productsWithApi });
            } catch (err) {
                console.error(err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        
        return true; 
    }
})
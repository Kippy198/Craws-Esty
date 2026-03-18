export async function saveProducts(products) {
    try {
        const res = await fetch("http://localhost:3000/products", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(products)
        })
        const data = await res.json();
        console.log("Saved to server: " , data);
    } catch (error) {
        console.log("API error", error);
    }
}
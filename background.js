// Service worker for Manifest V3
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.action === "lookup_coupon") {
            // Use fetch instead of XMLHttpRequest
            fetch(`https://www.hfqpdb.com/price_check/${request.itemno}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    sendResponse(data);
                })
                .catch(error => {
                    console.error('Error fetching coupon data:', error);
                    sendResponse({ error: 'Failed to fetch coupon data' });
                });
            
            return true; // Keep message channel open for async response
        }
    }
);

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Harbor Freight Coupons extension installed');
});

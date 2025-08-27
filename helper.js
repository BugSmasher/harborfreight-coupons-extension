// Modern JavaScript with better error handling
const itemRegex = /\d+/g;

// Polyfill for String.prototype.matchAll if needed
if (!String.prototype.matchAll) {
    String.prototype.matchAll = function(regexp) {
        const matches = [];
        this.replace(regexp, function() {
            const arr = ([]).slice.call(arguments, 0);
            const extras = arr.splice(-2);
            arr.index = extras[0];
            arr.input = extras[1];
            matches.push(arr);
        });
        return matches.length ? matches : null;
    };
}

function lookupCoupon(itemno, callback) {
    chrome.runtime.sendMessage({
        action: "lookup_coupon",
        itemno: itemno
    }, function(data) {
        if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            callback({ error: 'Failed to communicate with extension' });
            return;
        }
        callback(data || { error: 'No data received' });
    });
}

function findSingleItemNo() {
    let itemno = 0;
    
    // Method 1: Extract from URL (most reliable)
    try {
        const urlMatch = window.location.pathname.match(/(\d+)\.html$/);
        if (urlMatch && urlMatch[1]) {
            itemno = urlMatch[1];
            //console.log('Found item number from URL:', itemno);
            return itemno;
        }
    } catch (ex) {
        //console.warn('Failed to get product ID from URL:', ex);
    }
    
    // Method 2: Extract from meta keywords
    try {
        const metaElement = document.querySelector("meta[name='keywords']");
        if (metaElement) {
            const keywords = metaElement.getAttribute("content");
            const keywordMatch = keywords.match(/(\d+)/);
            if (keywordMatch && keywordMatch[1]) {
                itemno = keywordMatch[1];
                //console.log('Found item number from keywords:', itemno);
                return itemno;
            }
        }
    } catch (ex) {
        console.warn('Failed to get product ID from keywords:', ex);
    }
    
    // Method 3: Look for SKU in the page content
    try {
        // Look for common SKU patterns in the page
        const skuSelectors = [
            '[class*="sku"]',
            '[class*="SKU"]',
            '[class*="item"]',
            '[class*="product"]',
            '.product-info',
            '.product-details'
        ];
        
        for (const selector of skuSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                const text = element.textContent || element.innerText;
                const skuMatch = text.match(/(?:SKU|Item|Product|#)\s*:?\s*(\d+)/i);
                if (skuMatch && skuMatch[1]) {
                    itemno = skuMatch[1];
                    console.log('Found item number from page content:', itemno);
                    return itemno;
                }
            }
        }
    } catch (ex) {
        console.warn('Failed to get product ID from page content:', ex);
    }
    
    // Method 4: Fallback to old meta tag method (but log it's not the right one)
    try {
        const metaElement = document.querySelector("meta[property='og:product_id']");
        if (metaElement) {
            const wrongId = metaElement.getAttribute("content");
            console.warn('Found og:product_id but this is NOT the SKU we need:', wrongId);
            console.warn('We need the actual item number like 58473, not the internal ID like 22983');
        }
    } catch (ex) {
        console.warn('Failed to get product ID from meta tag:', ex);
    }
    
    console.error('Could not find valid item number/SKU on this page');
    return null;
}

function findListItemNumber(priceboxdiv) {
    let itemno = 0;
    try {
        const productIdsElement = priceboxdiv.parentNode.querySelector('.product-ids');
        if (productIdsElement) {
            const matches = productIdsElement.innerText.matchAll(itemRegex);
            if (matches) {
                itemno = matches[matches.length - 1];
            }
        }
    } catch (ex) {
        console.warn('Failed to get list item number:', ex);
    }
    return itemno;
}

function findWishlistItemNumber(priceboxdiv) {
    let itemno = 0;
    try {
        const wishlistSkuElement = priceboxdiv.parentNode.parentNode.querySelector('.wishlist-sku');
        if (wishlistSkuElement) {
            const matches = wishlistSkuElement.innerText.matchAll(itemRegex);
            if (matches) {
                itemno = matches[matches.length - 1];
            }
        }
    } catch (ex) {
        console.warn('Failed to get wishlist item number:', ex);
    }
    return itemno;
}

function buildCouponLinkElement(text, url) {
    const a = document.createElement('a');
    a.href = url;
    a.innerText = text;
    a.style.display = 'inline-block';
    a.style.border = '2px dashed #308104';
    a.style.color = '#308104';
    a.title = 'Provided by hfqpdb.com';
    a.target = '_blank'; // Open in new tab for security
    a.rel = 'noopener noreferrer'; // Security best practice
    return a;
}

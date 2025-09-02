// Global variables for tracking processed SKUs and current page
var processedSkus = new Set();
var lastProcessedUrl = '';
let keepAliveInterval;

// Extension context validation
function isExtensionContextValid() {
    return !!(chrome && chrome.runtime && chrome.runtime.sendMessage);
}

// Keep extension alive mechanism
function keepExtensionAlive() {
    if (isExtensionContextValid()) {
        try {
            chrome.runtime.sendMessage({type: 'ping'}, function(response) {
                if (chrome.runtime.lastError) {
                    // Extension context still valid
                }
            });
        } catch (e) {
            // Extension context check completed
        }
    }
}

function startKeepAlive() {
    keepAliveInterval = setInterval(keepExtensionAlive, 30000);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

// Consolidated DOM traversal function
function findContainerByCriteria(element, criteria, maxDepth = 10) {
    let current = element;
    let depth = 0;
    
    while (current && current !== document.body && depth < maxDepth) {
        if (criteria(current)) {
            return current;
        }
        current = current.parentElement;
        depth++;
    }
    return null;
}

// Consolidated SKU extraction function
function extractSku(element) {
    // Method 1: Data attributes
    const skuAttr = element.getAttribute('data-sku') || 
                    element.getAttribute('data-item') ||
                    element.getAttribute('data-product-id');
    if (skuAttr) return skuAttr;
    
    // Method 2: Text content
    const text = element.textContent || element.innerText;
    const skuMatch = text.match(/(?:SKU|Item|Product|#)\s*:?\s*(\d+)/i);
    if (skuMatch && skuMatch[1]) return skuMatch[1];
    
    // Method 3: Links
    const links = element.querySelectorAll('a[href*=".html"]');
    for (const link of links) {
        const href = link.getAttribute('href');
        const urlMatch = href.match(/(\d+)\.html$/);
        if (urlMatch && urlMatch[1]) return urlMatch[1];
    }
    
    // Method 4: Images
    const images = element.querySelectorAll('img[src*="catalog"]');
    for (const img of images) {
        const src = img.getAttribute('src');
        const srcMatch = src.match(/(\d+)\.(?:jpg|png|gif|webp)/i);
        if (srcMatch && srcMatch[1]) return srcMatch[1];
    }
    
    // Method 5: Working extension method
    const priceElement = element.querySelector('div[class="cart_item_unit_price_dollars"]');
    if (priceElement) {
        let item = priceElement.parentNode.parentNode.childNodes[3] || false;
        if (item) {
            const link = item.querySelector("a[href$='html']");
            if (link) {
                const href = link.href;
                const urlMatch = href.match(/-\d+\.html/);
                if (urlMatch) {
                    const skuMatch = urlMatch[0].match(/\d+/);
                    if (skuMatch) return skuMatch[0];
                }
            }
        }
    }
    
    return null;
}

// Consolidated container finding function
function findContainer(priceElement, containerTypes, maxDepth = 10) {
    const criteria = (element) => {
        if (!element.classList) return false;
        
        for (const type of containerTypes) {
            if (type.classes && type.classes.some(cls => element.classList.contains(cls))) return true;
            if (type.attributes) {
                for (const [attr, value] of Object.entries(type.attributes)) {
                    if (element.getAttribute(attr) === value) return true;
                    if (value.includes && element.getAttribute(attr)?.includes(value)) return true;
                }
            }
            if (type.selector && element.querySelector(type.selector)) return true;
        }
        return false;
    };
    
    return findContainerByCriteria(priceElement, criteria, maxDepth);
}

// Simplified cart page processing
function processCartPage() {
    const cartPriceElements = document.querySelectorAll('.cart-items__itemPrice--lKZ1iU, [class*="cart-items__itemPrice"]');
    
    if (cartPriceElements.length === 0) {
        setTimeout(processCartPage, 1000);
        return;
    }
    
    const cartSkus = extractCartSkusFromJsonLd();
    let processedAny = false;
    
    cartPriceElements.forEach(function(priceElement, index) {
        let sku = null;
        
        // Try to match by price from JSON-LD data
        const priceText = priceElement.textContent.trim();
        for (const skuData of cartSkus) {
            if (skuData.price && priceText.includes(skuData.price)) {
                sku = skuData.sku;
                break;
            }
        }
        
        // Fallback to finding SKU in the cart item container
        if (!sku) {
            const cartItem = findContainer(priceElement, [
                { classes: ['cart-item', 'cart_item', 'item', 'product-item'] },
                { attributes: { 'data-testid': ['cart', 'item'], 'role': 'listitem' } },
                { selector: 'img[src*="catalog"], a[href*=".html"], [class*="title"], [class*="name"]' }
            ]);
            if (cartItem) {
                sku = extractSku(cartItem);
            }
        }
        
        if (sku && !processedSkus.has(sku)) {
            processedSkus.add(sku);
            addCouponToCartItem(priceElement, sku);
            processedAny = true;
        }
    });
}

// JSON-LD SKU extraction
function extractCartSkusFromJsonLd() {
    const cartSkus = [];
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    
    scripts.forEach(script => {
        try {
            const data = JSON.parse(script.textContent);
            if (data['@type'] === 'ItemList' && data.itemListElement) {
                data.itemListElement.forEach((item, index) => {
                    if (item.item && item.item.sku) {
                        const sku = item.item.sku;
                        const name = item.item.name || '';
                        const price = item.item.offers?.price || '';
                        cartSkus.push({ sku, name, price });
                    }
                });
            }
        } catch (e) {
            // JSON-LD parse error
        }
    });
    
    return cartSkus;
}

// Add coupon to cart item
function addCouponToCartItem(priceElement, itemno) {
    if (priceElement.querySelector('[data-hf-coupon]')) return;
    
    lookupCoupon(itemno, function(resp) {
        if (!resp || resp.error || !resp.hasOwnProperty('bestPrice')) return;
        
        let couponText = 'HFQPDB - $' + resp.bestPrice;
        if ((resp.bestPrice + '').toLowerCase().includes('free')) {
            couponText = 'HFQPDB - FREE';
        }
        
        const couponLink = buildCouponLinkElement(couponText, resp.url);
        couponLink.setAttribute('data-hf-coupon', itemno);
        couponLink.style.cssText = 'display:block; margin-top:8px; margin-left:0; padding:6px 10px; background:#f0f8f0; border-radius:4px; text-align:center; font-size:14px; font-weight:bold; color:#333; border:2px solid #4CAF50; width:fit-content; max-width:200px;';
        
        // Insert the coupon below the price but within the price container
        priceElement.appendChild(couponLink);
    });
}

// Add coupon to element (for single products and search results)
function addCouponToElement(priceElement, itemno) {
    lookupCoupon(itemno, function(resp) {
        if (!resp || resp.error || !resp.hasOwnProperty('bestPrice')) {
            return;
        }
        
        // Check if coupon already exists
        if (priceElement.querySelector('[data-hf-coupon]')) {
            return;
        }
        
        // Use consistent coupon text format with HFQPDB prefix
        let couponText = 'HFQPDB - $' + resp.bestPrice;
        if ((resp.bestPrice + '').toLowerCase().includes('free')) {
            couponText = 'HFQPDB - FREE';
        }
        
        const couponLink = buildCouponLinkElement(couponText, resp.url);
        couponLink.setAttribute('data-hf-coupon', itemno);
        
        // Single product/search result styling - block below price
        couponLink.style.cssText = 'display:block; margin-top:8px; padding:5px; background:#f0f8f0; border-radius:4px; text-align:center; font-size:16px; font-weight:bold; color:#333; border:2px solid #4CAF50;';
        
        // Use the priceElement that was passed in (the desktop container we already found)
        if (priceElement.parentElement) {
            // Insert after the desktop price container
            priceElement.parentElement.insertBefore(couponLink, priceElement.nextSibling);
        }
    });
}

// Function to find a pricing-specific container for better coupon placement
function findPricingSpecificContainer(priceElement) {
    // Look for a container that only holds pricing information (not the entire cart item)
    let current = priceElement;
    let depth = 0;
    const maxDepth = 8; // Limit depth to avoid going too far up
    
    while (current && current !== document.body && depth < maxDepth) {
        // Look for containers that are specifically for pricing
        if (current.classList && (
            current.classList.contains('price') ||
            current.classList.contains('pricing') ||
            current.classList.contains('product-price') ||
            current.classList.contains('price-container') ||
            current.classList.contains('price-wrap') ||
            current.classList.contains('price-info') ||
            current.classList.contains('item-price') ||
            current.classList.contains('cart-item-price')
        )) {
            return current;
        }
        
        // Look for containers that have price-related data attributes
        if (current.getAttribute && (
            current.getAttribute('data-testid')?.includes('price') ||
            current.getAttribute('data-testid')?.includes('pricing') ||
            current.getAttribute('role') === 'price'
        )) {
            return current;
        }
        
        // Check if this element contains only pricing-related content
        if (current.children && current.children.length <= 3) {
            const hasPriceContent = current.textContent && (
                current.textContent.includes('$') ||
                current.textContent.match(/\d+\.\d{2}/) ||
                current.querySelector('[class*="price"]')
            );
            
            if (hasPriceContent && !current.textContent.includes('Protect This') && 
                !current.textContent.includes('Extended Service') &&
                !current.textContent.includes('Add to My List')) {
                return current;
            }
        }
        
        current = current.parentElement;
        depth++;
    }
    
    return null;
}

// Function to find the best placement container for cart item coupons
function findCartItemPlacementContainer(priceElement) {
    // Look for the cart item container that holds the pricing information
    let current = priceElement;
    let depth = 0;
    const maxDepth = 12;
    
    while (current && current !== document.body && depth < maxDepth) {
        // Look for cart item containers
        if (current.classList && (
            current.classList.contains('cart-item') ||
            current.classList.contains('cart_item') ||
            current.classList.contains('item') ||
            current.classList.contains('product-item') ||
            current.getAttribute('data-testid')?.includes('cart') ||
            current.getAttribute('data-testid')?.includes('item')
        )) {
            return current;
        }
        
        // Look for other containers that typically hold cart item pricing
        if (current.classList && (
            current.classList.contains('price') ||
            current.classList.contains('pricing') ||
            current.classList.contains('product-price') ||
            current.classList.contains('price-container') ||
            current.classList.contains('price-wrap') ||
            current.classList.contains('price-info') ||
            current.classList.contains('product-info') ||
            current.classList.contains('product-details')
        )) {
            return current;
        }
        
        current = current.parentElement;
        depth++;
    }
    
    return null;
}

// Main display function
function displayCoupons() {
    const currentUrl = window.location.href;
    
    if (lastProcessedUrl !== currentUrl) {
        processedSkus.clear();
        lastProcessedUrl = currentUrl;
    }
    
    if (!isExtensionContextValid()) return;

    // Check if this is a cart page first
    if (window.location.pathname.includes('/cart')) {
        processCartPage();
        return;
    }

    // Update the single product page detection to be more specific
    if (window.location.pathname.includes('.html') && 
        window.location.pathname.match(/\d+\.html$/)) {
        
        // Look for desktop-only price container (exclude mobile bar versions)
        const mainPriceContainer = document.querySelector('[data-testid="priceWrap"]:not(.price__mobileBar):not([class*="mobileBar"]), .price__container:not(.price__mobileBar):not([class*="mobileBar"])');
        
        if (!mainPriceContainer) {
            setTimeout(displayCoupons, 1000);
            return;
        }
        
        // For single product pages, ONLY process the desktop price container
        const itemno = findSingleItemNo();
        
        if (itemno && !processedSkus.has(itemno)) {
            processedSkus.add(itemno);
            addCouponToElement(mainPriceContainer, itemno);
        } else if (!itemno) {
            setTimeout(displayCoupons, 1000);
        }
        return;
    } else {
        
        // Search results page - check if we have new content to process
        const allPriceElements = document.querySelectorAll('[class*="price"]');
        
        if (allPriceElements.length === 0) {
            setTimeout(displayCoupons, 1000);
            return;
        }
        
        // Check if search results are currently loading/changing
        const loadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"], [class*="overlay"]');
        const hasLoadingState = loadingElements.length > 0;
        
        if (hasLoadingState) {
            setTimeout(displayCoupons, 500); // Check again soon
            return;
        }
        
        // Check if we have new products that we haven't processed yet
        let hasNewProducts = false;
        let newProductCount = 0;
        
        for (const priceElement of allPriceElements) {
            const productCard = findContainer(priceElement, [
                { classes: ['product-card', 'product-item', 'grid-item', 'catalog-item'] },
                { attributes: { 'data-testid': ['product', 'item'], 'role': 'article' } },
                { selector: 'img[src*="catalog"], a[href*=".html"], [class*="title"], [class*="name"]' }
            ]);
            if (productCard) {
                const sku = extractSku(productCard);
                if (sku && !processedSkus.has(sku)) {
                    hasNewProducts = true;
                    newProductCount++;
                }
            }
        }
        
        if (!hasNewProducts) {
            return; // Don't retry if we've already processed everything
        }
        
        // Filter out mobile price elements for search results
        const desktopPriceElements = Array.from(allPriceElements).filter(el => {
            return !el.classList.contains('mobile-bar__') && 
                   !el.closest('.mobile-bar') && 
                   !el.closest('[class*="mobile-bar"]');
        });
        
        // Process only the new products
        let processedAny = false;
        desktopPriceElements.forEach(function(priceElement) {
            const productCard = findContainer(priceElement, [
                { classes: ['product-card', 'product-item', 'grid-item', 'catalog-item'] },
                { attributes: { 'data-testid': ['product', 'item'], 'role': 'article' } },
                { selector: 'img[src*="catalog"], a[href*=".html"], [class*="title"], [class*="name"]' }
            ]);
            if (productCard) {
                const sku = extractSku(productCard);
                if (sku && !processedSkus.has(sku)) {
                    processedSkus.add(sku);
                    addCouponToElement(priceElement, sku);
                    processedAny = true;
                }
            }
        });
    }
}

// Clear stale coupon markers
function clearStaleCouponMarkersIfUserRefresh() {
    const currentUrl = window.location.href;
    const lastUrl = sessionStorage.getItem('lastPageUrl');
    
    if (lastUrl && lastUrl !== currentUrl) {
        const staleMarkers = document.querySelectorAll('[data-hf-coupon]');
        if (staleMarkers.length > 0) {
            staleMarkers.forEach(marker => marker.removeAttribute('data-hf-coupon'));
        }
        processedSkus.clear();
        sessionStorage.setItem('lastPageUrl', currentUrl);
        return;
    }
    
    if (isUserRefresh()) {
        const staleMarkers = document.querySelectorAll('[data-hf-coupon]');
        if (staleMarkers.length > 0) {
            staleMarkers.forEach(marker => marker.removeAttribute('data-hf-coupon'));
        }
    }
    
    sessionStorage.setItem('lastPageUrl', currentUrl);
}

// Check if user refresh
function isUserRefresh() {
    if (performance.navigation) {
        return performance.navigation.type === 1;
    }
    
    if (performance.getEntriesByType) {
        const navigationEntries = performance.getEntriesByType('navigation');
        if (navigationEntries.length > 0) {
            return navigationEntries[0].type === 'reload';
        }
    }
    
    return false;
}

// Initialize extension
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (!isExtensionContextValid()) return;
        
        clearStaleCouponMarkersIfUserRefresh();
        displayCoupons();
        startKeepAlive();
        
        setTimeout(function() {
            if (isExtensionContextValid()) {
                displayCoupons();
            }
        }, 500);
    });
} else {    
    clearStaleCouponMarkersIfUserRefresh();
    displayCoupons();
    startKeepAlive();
    
    setTimeout(function() {
        if (isExtensionContextValid()) {
            displayCoupons();
        }
    }, 500);
}

// Watch for URL changes
let currentUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        processedSkus.clear();
        setTimeout(displayCoupons, 1000);
    }
}, 1000);

// Cleanup
window.addEventListener('beforeunload', function() {
    stopKeepAlive();
});

document.addEventListener('visibilitychange', function() {
    if (!document.hidden && isExtensionContextValid()) {
        displayCoupons();
    }
});

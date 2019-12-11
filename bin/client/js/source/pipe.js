import io from 'socket.io-client';
document.addEventListener("DOMContentLoaded", function() {
    let connect = document.querySelector('[data-connect]').getAttribute('data-connect');
    const socket = io(connect);
    let elements = [];
    const resource = performance.getEntriesByType("resource");
    const pagesrc = document.querySelector('[data-connect]').getAttribute('data-src');
    socket.on('change', (event, url, relative) => {
        if(relative == pagesrc) {
            console.log('this page has been changed.');
            return window.location.reload();
        }
        for(let res of resource) {
            if(res.name == url) {
                if(res.initiatorType == 'link') {
                    let links = document.querySelectorAll('[href*="'+relative+'"]');
                    if(links.length) {
                        for(let link of links) {
                            link.setAttribute('href', url + '?v=' + Date.now());
                            console.log(`${relative} has been updated`);
                        }
                    }
                } else {
                    window.location.reload();
                }
            }
        }
    });
});
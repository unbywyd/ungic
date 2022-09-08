import JSONTreeView from "json-tree-view";
import io from 'socket.io-client';

function Loader() {
    if (window.localStorage.getItem('wp-last-scroll-position')) {
        let [x, y] = window.localStorage.getItem('wp-last-scroll-position').split(',');
        window.scrollTo(x, y);
        window.localStorage.removeItem('wp-last-scroll-position');
    }
    let debugs = document.querySelectorAll('.un-debug');
    if (debugs.length) {
        for (let debug of debugs) {
            let text = debug.innerHTML;
            try {
                let data = JSON.parse(text);
                let path = debug.getAttribute('data-path');
                if (!path) {
                    path = 'debug'
                }
                let view = new JSONTreeView(path, data);
                debug.style.display = 'none';
                let wrap = document.createElement('div');
                wrap.setAttribute('class', 'jsonViewWrap');
                wrap.appendChild(view.dom);
                debug.parentNode.insertBefore(wrap, debug);
                view.expand(true);
                view.readonly = true;
            } catch (e) {
                console.log(e);
            }
        }
    }

    let connect = document.querySelector('[data-connect]').getAttribute('data-connect');
    const socket = io(connect);
    const resource = window.performance ? window.performance.getEntriesByType("resource") : [];
    const pagesrc = document.querySelector('[data-connect]').getAttribute('data-src');
    socket.on('change', (events) => {
        for (let e of events) {
            let { event, relative, url, data } = e;
            if (event == 'iconsReload') {
                if (data.data.sprite) {
                    let prev = document.querySelector('.ungic-svg-sprite'), wrap = document.querySelector('.ungic-svg-sprite-wrap');
                    let anchor = wrap ? wrap : prev;

                    let el = document.createElement('div');
                    el.classList.add('ungic-svg-sprite-wrap');
                    el.innerHTML = data.data.sprite;

                    if (anchor) {
                        anchor.parentNode.insertBefore(el, anchor);
                        anchor.remove();
                    } else {
                        document.querySelector('body').appendChild(el);
                    }
                }
            }
            if (relative) {
                if (relative == pagesrc) {
                    reload();
                    return
                }
                let skips = [];
                if (relative.indexOf('.css') != -1) {
                    let links = document.querySelectorAll('[href*="' + relative + '"]');
                    if (links.length) {
                        for (let link of links) {
                            link.setAttribute('href', url + '?v=' + Date.now());
                            skips.push(link);
                        }
                    }
                }
                for (let res of resource) {
                    if (res.name.indexOf(url) != -1) {
                        if (res.initiatorType == 'link') {
                            let links = document.querySelectorAll('[href*="' + relative + '"]');
                            if (links.length) {
                                for (let link of links) {
                                    if (skips.indexOf(link) == -1) {
                                        link.setAttribute('href', url + '?v=' + Date.now());
                                    }
                                }
                            }
                        } else {
                            reload();
                        }
                    }
                }
            }
        }
    });
}

function reload() {
    var doc = document.documentElement;
    var x = (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0);
    var y = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
    window.localStorage.setItem('wp-last-scroll-position', `${x},${y}`);
    window.location.reload();
}

if (document.readyState === "complete" || document.readyState === "interactive") {
    Loader();
} else {
    window.addEventListener("DOMContentLoaded", Loader);
}

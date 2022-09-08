(function() {
    let clickTime;
    document.addEventListener('click', function(e) {
        let parent = e.target.closest(".ungic_icons-item");
        if (e.target.classList.contains('ungic_icons-item') || parent) {
            let el = parent ? parent : e.target;
            let id = el.getAttribute('data-id');
            var copyText = document.createElement("input");
            copyText.value = id;
            copyText.style.position = 'absolute';
            copyText.style.top = '-1000px';
            copyText.style.opacity = 0;
            document.querySelector('body').appendChild(copyText);
            copyText.select();
            copyText.setSelectionRange(0, 99999);
            document.execCommand("copy");
            let notifi = document.createElement('div');
            notifi.style.backgroundColor = '#5cc80d';
            notifi.style.color = '#FFF';
            notifi.style.fontSize = '20px';
            notifi.style.padding = '8px 20px';
            notifi.style.borderRadius = '4px';
            notifi.style.position = 'fixed';
            notifi.style.fontFamily = 'Arial';
            notifi.style.left = '20px';
            notifi.style.top = '20px';
            notifi.style.boxShadow = '3px 3px 12px rgba(0,0,0,.2)';
            notifi.style.zIndex = '1000';
            notifi.innerHTML = 'ID copied!'
            document.querySelector('body').appendChild(notifi);
            clearTimeout(clickTime);
            clickTime = setTimeout(function() {
                notifi.remove();
                copyText.remove();
            }, 1000);
        }
    });
})();
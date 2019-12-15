const svgSprite = require('svg2sprite');
const sprite = svgSprite.collection({ inline: true });

var svgstore = require('svgstore');
let SVGO = require('svgo');
let svgo = new SVGO({
    plugins: [
        {removeUselessDefs: false},
        {removeViewBox: false},
        {removeDimensions: true},
        {cleanupListOfValues:true},
        {cleanupListOfValues:true},
        {removeRasterImage: true},
        {convertStyleToAttrs: false},
        {removeStyleElement: true},
        {removeScriptElement: true},
        {convertPathData: {noSpaceAfterFlags: false}},
        {mergePaths:false},
        {removeAttrs: {attrs:'(fill|stroke)'}}
    ]
});

let res = svgo.optimize(`<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 16.0.3, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="24px"
     height="24px" enable-background="new 0 0 24 24" xml:space="preserve">
    <symbol viewBox="0 0 24 24">
        <g id="Outline_Icons_1_">
            <g id="Outline_Icons">
                <path d="M23.5,19c-1.378,0-2.5-1.122-2.5-2.5V11c0-3.641-2.24-6.951-5.603-8.325C15.022,1.108,13.637,0,12,0
                    c-1.612,0-3.024,1.131-3.399,2.675C5.239,4.048,3,7.358,3,11v5.5C3,17.878,1.878,19,0.5,19C0.224,19,0,19.224,0,19.5
                    S0.224,20,0.5,20h8.051c0.245,1.691,1.69,3,3.449,3s3.204-1.309,3.449-3H23.5c0.276,0,0.5-0.224,0.5-0.5S23.776,19,23.5,19z
                     M12,22c-1.207,0-2.217-0.86-2.449-2h4.898C14.217,21.14,13.207,22,12,22z M2.947,19C3.597,18.365,4,17.479,4,16.5V11
                    c0-3.32,2.094-6.33,5.211-7.49c0.17-0.063,0.292-0.214,0.32-0.393C9.716,1.911,10.778,1,12,1c1.239,0,2.276,0.891,2.465,2.117
                    c0.027,0.179,0.15,0.329,0.32,0.393C17.904,4.671,20,7.681,20,11v5.5c0,0.979,0.403,1.865,1.053,2.5H2.947z"/>
            </g>
            <g id="New_icons_1_">
            </g>
        </g>
        <g id="Invisible_Shape">
            <rect fill="none" width="24" height="24"/>
        </g>
    </symbol>
</svg>
`);

console.log(res);

/*sprite.add('chevron-up', `<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 16.0.3, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="24px"
     height="24px" viewBox="0 0 24 24" enable-background="new 0 0 24 24" xml:space="preserve">
<g id="Outline_Icons_1_">
    <g id="Outline_Icons">
        <g>
            <path d="M20.5,21c-0.827,0-1.5-0.673-1.5-1.5V15c0-2.728-1.567-5.18-4.019-6.333C14.815,7.169,13.542,6,12,6
                S9.185,7.169,9.019,8.667C6.567,9.819,5,12.271,5,15v4.5C5,20.327,4.327,21,3.5,21C3.224,21,3,21.224,3,21.5S3.224,22,3.5,22
                h6.051c0.232,1.14,1.242,2,2.449,2s2.217-0.86,2.449-2H20.5c0.276,0,0.5-0.224,0.5-0.5S20.776,21,20.5,21z M12,23
                c-0.651,0-1.201-0.419-1.408-1h2.816C13.201,22.581,12.651,23,12,23z M5.499,21C5.813,20.582,6,20.062,6,19.5V15
                c0-2.43,1.449-4.604,3.692-5.538C9.878,9.384,10,9.202,10,9c0-1.103,0.897-2,2-2s2,0.897,2,2c0,0.202,0.121,0.384,0.308,0.462
                C16.551,10.398,18,12.571,18,15v4.5c0,0.562,0.187,1.082,0.501,1.5H5.499z"/>
            <path d="M4,9.5C4,9.224,3.776,9,3.5,9H1.707l2.146-2.146C3.997,6.71,4.04,6.496,3.962,6.309C3.885,6.122,3.702,6,3.5,6h-3
                C0.224,6,0,6.224,0,6.5S0.224,7,0.5,7h1.793L0.146,9.146C0.003,9.29-0.04,9.504,0.038,9.691C0.115,9.878,0.298,10,0.5,10h3
                C3.776,10,4,9.776,4,9.5z"/>
            <path d="M9.5,2h0.793L9.146,3.146C9.003,3.29,8.96,3.504,9.038,3.691C9.115,3.878,9.298,4,9.5,4h2C11.776,4,12,3.776,12,3.5
                S11.776,3,11.5,3h-0.793l1.146-1.146c0.143-0.143,0.186-0.358,0.108-0.544C11.885,1.122,11.702,1,11.5,1h-2
                C9.224,1,9,1.224,9,1.5S9.224,2,9.5,2z"/>
            <path d="M23.5,7h-2.793l3.146-3.146c0.143-0.143,0.186-0.358,0.108-0.544C23.885,3.122,23.702,3,23.5,3h-4
                C19.224,3,19,3.224,19,3.5S19.224,4,19.5,4h2.793l-3.146,3.146c-0.143,0.143-0.186,0.358-0.108,0.545
                C19.115,7.878,19.298,8,19.5,8h4C23.776,8,24,7.776,24,7.5S23.776,7,23.5,7z"/>
        </g>
    </g>
    <g id="New_icons_1_">
    </g>
</g>
<g id="Invisible_Shape">
    <rect fill="none" width="24" height="24"/>
</g>
</svg>`);
sprite.add('chevron-down', '<svg><path d="M5 11L0 6l1.5-1.5L5 8.25 8.5 4.5 10 6z"></path></svg>');

const svg = sprite.compile();

console.log(svg);*/
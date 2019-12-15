module.exports = {
    start_codepoint: {
        type: 'number',
        default: 61696
    },
    font_name: {
        type: 'string',
        default: 'ungic'
    },
    class_name: {
        type: 'string',
        default: 'icon'
    },
    dev_mode: {
        type: 'string',
        default: 'fonts',
        enum: ['svg_sprite', 'fonts', 'img_sprite']
    },
    icons_width: {
        type: 'number',
        default: 512
    }
}
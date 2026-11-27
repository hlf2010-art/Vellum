import Cocoa

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: make_icon <output-dir>\n", stderr)
    exit(1)
}
let outDir = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

/// The Vellum mark, same geometry as website/assets/mark.svg: a lit card (the star)
/// and two dimmer cards held at its edges (the planets). Drawn in that SVG's
/// 100-unit space, y down, into `rect`.
func drawVellumMark(in ctx: CGContext, rect: CGRect, tile: Bool) {
    ctx.saveGState()
    ctx.translateBy(x: rect.minX, y: rect.maxY)
    ctx.scaleBy(x: rect.width / 100, y: -rect.height / 100)
    if tile {
        let t = CGPath(roundedRect: CGRect(x: 0, y: 0, width: 100, height: 100), cornerWidth: 24, cornerHeight: 24, transform: nil)
        ctx.addPath(t)
        ctx.setFillColor(NSColor(srgbRed: 0x16 / 255.0, green: 0x17 / 255.0, blue: 0x1b / 255.0, alpha: 1).cgColor)
        ctx.fillPath()
        let edge = CGPath(roundedRect: CGRect(x: 0.6, y: 0.6, width: 98.8, height: 98.8), cornerWidth: 23.4, cornerHeight: 23.4, transform: nil)
        ctx.addPath(edge)
        ctx.setStrokeColor(NSColor(white: 1, alpha: 0.12).cgColor)
        ctx.setLineWidth(1.2)
        ctx.strokePath()
        ctx.translateBy(x: 12, y: 12)
        ctx.scaleBy(x: 0.76, y: 0.76)
    }
    ctx.translateBy(x: 50, y: 50)
    ctx.rotate(by: -8 * .pi / 180)
    ctx.translateBy(x: -50, y: -50)
    ctx.translateBy(x: -2, y: -5)
    func card(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat, _ a: CGFloat) {
        ctx.addPath(CGPath(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerWidth: r, cornerHeight: r, transform: nil))
        ctx.setFillColor(NSColor(srgbRed: 0xf6 / 255.0, green: 0xf7 / 255.0, blue: 0xf9 / 255.0, alpha: a).cgColor)
        ctx.fillPath()
    }
    card(63, 36, 23, 28, 8, 0.32)
    card(24, 71, 25, 21, 7.5, 0.32)
    card(18, 18, 42, 50, 13, 1)
    ctx.restoreGState()
}

func renderIcon(size: Int) -> Data? {
    let s = CGFloat(size)
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size,
        pixelsHigh: size,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let ctx = NSGraphicsContext.current!.cgContext
    // macOS icon grid: the tile sits inside a transparent margin.
    let inset = s * 0.09
    drawVellumMark(in: ctx, rect: CGRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2), tile: true)
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])
}

let specs: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]

for (name, px) in specs {
    if let data = renderIcon(size: px) {
        try data.write(to: outDir.appendingPathComponent(name))
    }
}

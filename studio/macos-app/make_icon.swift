import Cocoa

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: make_icon <output-dir>\n", stderr)
    exit(1)
}
let outDir = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

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

    let inset = s * 0.075
    let rect = CGRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2)
    let radius = s * 0.21
    let squircle = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)

    // Deep obsidian base with subtle radial glow
    ctx.saveGState()
    ctx.addPath(squircle)
    ctx.clip()

    let cs = CGColorSpaceCreateDeviceRGB()
    let bgGrad = CGGradient(
        colorsSpace: cs,
        colors: [
            NSColor(srgbRed: 0.08, green: 0.09, blue: 0.12, alpha: 1).cgColor,
            NSColor(srgbRed: 0.04, green: 0.045, blue: 0.06, alpha: 1).cgColor,
        ] as CFArray,
        locations: [0, 1]
    )!
    ctx.drawLinearGradient(bgGrad, start: CGPoint(x: s * 0.5, y: s), end: CGPoint(x: s * 0.5, y: 0), options: [])

    // Soft warm amber + cool blue ambient bloom
    let warmGlow = CGGradient(
        colorsSpace: cs,
        colors: [
            NSColor(srgbRed: 1.0, green: 0.85, blue: 0.58, alpha: 0.22).cgColor,
            NSColor(srgbRed: 1.0, green: 0.85, blue: 0.58, alpha: 0.0).cgColor,
        ] as CFArray,
        locations: [0, 1]
    )!
    ctx.drawRadialGradient(
        warmGlow,
        startCenter: CGPoint(x: s * 0.5, y: s * 0.58),
        startRadius: 0,
        endCenter: CGPoint(x: s * 0.5, y: s * 0.58),
        endRadius: s * 0.42,
        options: []
    )

    let blueGlow = CGGradient(
        colorsSpace: cs,
        colors: [
            NSColor(srgbRed: 0.30, green: 0.56, blue: 1.0, alpha: 0.18).cgColor,
            NSColor(srgbRed: 0.30, green: 0.56, blue: 1.0, alpha: 0.0).cgColor,
        ] as CFArray,
        locations: [0, 1]
    )!
    ctx.drawRadialGradient(
        blueGlow,
        startCenter: CGPoint(x: s * 0.5, y: s * 0.22),
        startRadius: 0,
        endCenter: CGPoint(x: s * 0.5, y: s * 0.22),
        endRadius: s * 0.38,
        options: []
    )
    ctx.restoreGState()

    // Crisp glass edge
    ctx.addPath(squircle)
    ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.14).cgColor)
    ctx.setLineWidth(max(1.0, s * 0.008))
    ctx.strokePath()

    // Central luminous Vellum triangle prism mark
    let top = CGPoint(x: s * 0.50, y: s * 0.72)
    let left = CGPoint(x: s * 0.28, y: s * 0.31)
    let right = CGPoint(x: s * 0.72, y: s * 0.31)
    let prism = CGMutablePath()
    prism.move(to: top)
    prism.addLine(to: right)
    prism.addLine(to: left)
    prism.closeSubpath()

    ctx.saveGState()
    ctx.addPath(prism)
    ctx.setLineJoin(.round)
    ctx.setStrokeColor(NSColor(srgbRed: 0.96, green: 0.97, blue: 1.0, alpha: 0.92).cgColor)
    ctx.setLineWidth(max(1.5, s * 0.036))
    ctx.strokePath()

    // Inner diagonal refraction rays
    ctx.move(to: top)
    ctx.addLine(to: CGPoint(x: s * 0.50, y: s * 0.31))
    ctx.setStrokeColor(NSColor(srgbRed: 1.0, green: 0.87, blue: 0.62, alpha: 0.78).cgColor)
    ctx.setLineWidth(max(1.0, s * 0.022))
    ctx.strokePath()
    ctx.restoreGState()

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

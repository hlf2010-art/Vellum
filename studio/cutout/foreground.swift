import Foundation
import Vision
import CoreImage
import ImageIO

// A nearly uniform outer field is common in logos. Only erase matching
// pixels reachable from an edge; isolated details never enter the queue.
func graphicMask(_ image: CIImage, context: CIContext) -> CIImage? {
    let w = Int(image.extent.width), h = Int(image.extent.height)
    guard w >= 16, h >= 16, w*h <= 12_000_000 else { return nil }
    var rgba = [UInt8](repeating: 0, count: w*h*4)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    context.render(image, toBitmap: &rgba, rowBytes: w*4, bounds: image.extent, format: .RGBA8, colorSpace: space)
    var samples = [[Int]](repeating: [], count: 3)
    var border = [Int]()
    for i in 0..<96 {
        let x = i*(w-1)/95, y = i*(h-1)/95
        border += [x,(h-1)*w+x,y*w,y*w+w-1]
    }
    guard border.filter({ rgba[$0*4+3] >= 240 }).count >= border.count*98/100 else { return nil }
    // Core Image renders premultiplied RGBA. Compare straight colors so a
    // slightly translucent border is classified like its opaque neighbors.
    for p in 0..<(w*h) {
        let j=p*4, alpha=Int(rgba[j+3])
        if alpha>0 && alpha<255 {
            for c in 0..<3 { rgba[j+c]=UInt8(min(255,(Int(rgba[j+c])*255+alpha/2)/alpha)) }
        }
    }
    for p in border {
        for c in 0..<3 { samples[c].append(Int(rgba[p*4+c])) }
    }
    let bg = samples.map { $0.sorted()[$0.count/2] }
    func distance(_ p:Int) -> Int {
        let j=p*4
        return max(abs(Int(rgba[j])-bg[0]),abs(Int(rgba[j+1])-bg[1]),abs(Int(rgba[j+2])-bg[2]))
    }
    let distances=border.map(distance).sorted()
    guard distances[distances.count*98/100] <= 13 else { return nil }
    let tolerance=min(18,max(5,distances[distances.count*98/100]+5))
    var mask=[UInt8](repeating:255,count:w*h), queue=[Int32]()
    func visit(_ p:Int) {
        if mask[p]==255 && distance(p)<=tolerance {
            mask[p]=0;queue.append(Int32(p))
        }
    }
    for x in 0..<w { visit(x);visit((h-1)*w+x) }
    for y in 0..<h { visit(y*w);visit(y*w+w-1) }
    var i=0
    while i<queue.count {
        let p=Int(queue[i]);i+=1
        if p%w>0 { visit(p-1) };if p%w<w-1 { visit(p+1) }
        if p>=w { visit(p-w) };if p<w*(h-1) { visit(p+w) }
    }
    guard queue.count>w*h/8,queue.count<w*h-4 else { return nil }
    return CIImage(bitmapData:Data(mask),bytesPerRow:w,size:CGSize(width:w,height:h),format:.L8,colorSpace:nil)
}

func cutout() throws {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, Double(width)*Double(height) <= 40_000_000,
          let image = CIImage(data: data, options: [.applyOrientationProperty:true]) else {
        throw NSError(domain:"Image", code:1)
    }
    let ctx=CIContext()
    let matte:CIImage
    if let graphic=graphicMask(image,context:ctx){ matte=graphic } else {
    let handler = VNImageRequestHandler(ciImage:image)
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
        throw NSError(domain:"Foreground", code:2)
    }
    let mask = try observation.generateScaledMaskForImage(forInstances:observation.allInstances, from:handler)
        matte=CIImage(cvPixelBuffer:mask)
    }
    let layer = image.applyingFilter("CIBlendWithMask", parameters:[
        kCIInputBackgroundImageKey:CIImage(color:.clear).cropped(to:image.extent),
        kCIInputMaskImageKey:matte])
    guard let png = ctx.pngRepresentation(of:layer,format:.RGBA8,colorSpace:CGColorSpace(name:CGColorSpace.sRGB)!) else { throw NSError(domain:"PNG",code:3) }
    FileHandle.standardOutput.write(png)
}
do { try cutout() } catch { exit(1) }

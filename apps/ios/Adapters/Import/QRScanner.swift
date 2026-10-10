import SwiftUI
import AVFoundation
import Vision
import ImageIO
import AuthBandCore

enum PhotoQR {
    static func read(_ data:Data) async throws -> [String] {
        try await Task.detached(priority:.userInitiated) {
            guard data.count<=30_000_000,let source=CGImageSourceCreateWithData(data as CFData,nil),let image=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceThumbnailMaxPixelSize:4096,kCGImageSourceCreateThumbnailWithTransform:true] as CFDictionary) else{throw ImportError.malformed}
            let request=VNDetectBarcodesRequest();request.symbologies=[.qr]
            try VNImageRequestHandler(cgImage:image).perform([request])
            let values=(request.results ?? []).compactMap(\.payloadStringValue)
            guard values.count<=100,values.allSatisfy({$0.utf8.count<=16384}) else{throw ImportError.tooLarge}
            return Array(Set(values)).sorted()
        }.value
    }
}

struct CameraScanner:View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var access=AVCaptureDevice.authorizationStatus(for:.video)
    let receive:([String])->Void
    var body:some View {
        NavigationStack {
            Group {
                if access == .authorized,phase == .active {CameraSurface(receive:receive).ignoresSafeArea(edges:.bottom)}
                else if access == .notDetermined {ProgressView()}
                else {ContentUnavailableView {Label("Camera chưa sẵn sàng",systemImage:"camera.fill")} actions:{Button("Đóng"){dismiss()};Button("Cài đặt"){if let url=URL(string:UIApplication.openSettingsURLString){UIApplication.shared.open(url)}}}}
            }.navigationTitle("Quét QR").navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.cancellationAction){Button("Đóng"){dismiss()}}}
                .task{if access == .notDetermined{_ = await AVCaptureDevice.requestAccess(for:.video);access=AVCaptureDevice.authorizationStatus(for:.video)}}
        }
    }
}

private struct CameraSurface:UIViewControllerRepresentable {
    let receive:([String])->Void
    func makeUIViewController(context:Context)->ScannerController {let controller=ScannerController();controller.receive=receive;return controller}
    func updateUIViewController(_ controller:ScannerController,context:Context) {}
    static func dismantleUIViewController(_ controller:ScannerController,coordinator:()) {controller.stop()}
}

private final class ScannerController:UIViewController,AVCaptureMetadataOutputObjectsDelegate {
    let session=AVCaptureSession()
    let queue=DispatchQueue(label:"dev.lordierclaw.authband.camera")
    var receive:(([String])->Void)?
    private var preview:AVCaptureVideoPreviewLayer?
    private var stopped=false
    private var delivered=false
    override func viewDidLoad() {
        super.viewDidLoad();view.backgroundColor = .black
        let preview=AVCaptureVideoPreviewLayer(session:session);preview.videoGravity = .resizeAspectFill;view.layer.addSublayer(preview);self.preview=preview
        queue.async { [weak self] in
            guard let self else{return}
            self.session.beginConfiguration();defer{self.session.commitConfiguration()}
            guard let device=AVCaptureDevice.default(for:.video),let input=try? AVCaptureDeviceInput(device:device),self.session.canAddInput(input) else{return}
            self.session.addInput(input);let output=AVCaptureMetadataOutput()
            guard self.session.canAddOutput(output) else{return};self.session.addOutput(output)
            output.setMetadataObjectsDelegate(self,queue:.main)
            if output.availableMetadataObjectTypes.contains(.qr){output.metadataObjectTypes=[.qr]}
        }
        queue.async { [weak self] in guard let self,!self.stopped else{return};self.session.startRunning() }
    }
    override func viewDidLayoutSubviews(){super.viewDidLayoutSubviews();preview?.frame=view.bounds}
    func stop() {receive=nil;delivered=true;queue.async{[weak self] in self?.stopped=true;self?.session.stopRunning()}}
    func metadataOutput(_ output:AVCaptureMetadataOutput,didOutput objects:[AVMetadataObject],from connection:AVCaptureConnection) {
        guard !delivered else{return}
        let values=objects.compactMap{($0 as? AVMetadataMachineReadableCodeObject)?.stringValue}.filter{$0.utf8.count<=16384}
        guard !values.isEmpty else{return};delivered=true;receive?(Array(values.prefix(100)))
    }
}

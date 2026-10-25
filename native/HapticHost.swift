import AppKit
import Foundation

// stdout is reserved exclusively for Chrome Native Messaging frames.
let input = FileHandle.standardInput
let output = FileHandle.standardOutput

func readExactly(_ count: Int) throws -> Data? {
    var result = Data()
    while result.count < count {
        guard let chunk = try input.read(upToCount: count - result.count), !chunk.isEmpty else {
            return nil
        }
        result.append(chunk)
    }
    return result
}

func send(_ message: [String: Any]) {
    do {
        let body = try JSONSerialization.data(withJSONObject: message, options: [.sortedKeys])
        var length = UInt32(body.count).littleEndian
        var frame = withUnsafeBytes(of: &length) { Data($0) }
        frame.append(body)
        try output.write(contentsOf: frame)
    } catch {
        exit(1)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

DispatchQueue.global(qos: .userInteractive).async {
    do {
        while let header = try readExactly(4) {
            let length = header.enumerated().reduce(UInt32(0)) { value, pair in
                value | (UInt32(pair.element) << (8 * pair.offset))
            }
            guard length > 0, length <= 65_536,
                  let body = try readExactly(Int(length)),
                  let message = try JSONSerialization.jsonObject(with: body) as? [String: Any] else {
                break
            }
            // AppKit haptic calls must execute on the main thread.
            DispatchQueue.main.sync {
                let id = message["id"] as? Int ?? 0
                switch message["command"] as? String {
                case "ping":
                    send(["id": id, "ok": true, "version": "0.1.0"])
                case "alignment":
                    NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
                    send(["id": id, "ok": true])
                default:
                    send(["id": id, "ok": false, "error": "Unknown command"])
                }
            }
        }
    } catch {
        // Never log diagnostics or protocol errors to stdout.
    }
    DispatchQueue.main.async { exit(0) }
}
app.run()

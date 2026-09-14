import Social
import UniformTypeIdentifiers

final class ShareViewController: SLComposeServiceViewController {
    private let appGroupId = "group.app.saveit.mobile"

    override func isContentValid() -> Bool {
        return true
    }

    override func didSelectPost() {
        Task {
            let url = await extractSharedURL()
            if let url {
                queue(url: url.absoluteString)
                openMainApp(url: url)
            }
            extensionContext?.completeRequest(returningItems: nil)
        }
    }

    override func configurationItems() -> [Any]! {
        return []
    }

    private func extractSharedURL() async -> URL? {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
              let providers = item.attachments else {
            return nil
        }

        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                return url
            }

            if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
               let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String,
               let match = text.range(of: #"https?://[^\s]+"#, options: .regularExpression) {
                return URL(string: String(text[match]))
            }
        }

        return nil
    }

    private func queue(url: String) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        var queue = defaults.array(forKey: "saveit.share.queue") as? [[String: String]] ?? []
        queue.append([
            "url": url,
            "created_at": ISO8601DateFormatter().string(from: Date())
        ])
        defaults.set(queue, forKey: "saveit.share.queue")
    }

    private func openMainApp(url: URL) {
        guard let encoded = url.absoluteString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let deepLink = URL(string: "saveit://share?url=\(encoded)") else {
            return
        }

        var responder: UIResponder? = self
        while responder != nil {
            if let application = responder as? UIApplication {
                application.open(deepLink)
                return
            }
            responder = responder?.next
        }
    }
}

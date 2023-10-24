//
//  SafariExtensionViewController.swift
//  Alexandria Extension
//
//  Created by Laurin Brandner on 22.10.2023.
//

import SafariServices

class SafariExtensionViewController: SFSafariExtensionViewController {
    
    static let shared: SafariExtensionViewController = {
        let shared = SafariExtensionViewController()
        shared.preferredContentSize = NSSize(width:320, height:240)
        return shared
    }()

}

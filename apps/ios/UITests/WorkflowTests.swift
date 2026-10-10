import XCTest
final class WorkflowTests:XCTestCase {
    func testGroupCreateRenameDeleteAndLargeText() {
        let app=XCUIApplication();app.launchArguments=["--uitest-public-fixture","-UIPreferredContentSizeCategoryName","UICTContentSizeCategoryAccessibilityXXXL"];app.launch()
        XCTAssertTrue(app.staticTexts["RFC 6238"].waitForExistence(timeout:10))
        let accounts=XCTAttachment(screenshot:app.screenshot());accounts.name="Accounts-Accessibility";accounts.lifetime = .keepAlways;add(accounts)
        app.tabBars.buttons["Nhóm"].tap();app.buttons["Thêm nhóm"].tap()
        let name=app.alerts.textFields["Tên nhóm"];XCTAssertTrue(name.waitForExistence(timeout:5));name.typeText("Work");app.alerts.buttons["Lưu"].tap()
        XCTAssertTrue(app.staticTexts["Work"].waitForExistence(timeout:10))
        app.staticTexts["Work"].tap();let renamed=app.alerts.textFields["Tên nhóm"];renamed.tap();renamed.typeText(String(repeating:XCUIKeyboardKey.delete.rawValue,count:4)+"Team");app.alerts.buttons["Lưu"].tap()
        XCTAssertTrue(app.staticTexts["Team"].waitForExistence(timeout:5))
        let shot=XCTAttachment(screenshot:app.screenshot());shot.name="Groups-Accessibility";shot.lifetime = .keepAlways;add(shot)
        app.staticTexts["Team"].swipeLeft();app.buttons["Xóa"].tap();app.buttons["Xóa nhóm"].tap()
        XCTAssertTrue(app.staticTexts["Cá nhân"].exists);XCTAssertFalse(app.staticTexts["Team"].waitForExistence(timeout:2))
    }
    func testManualImportPersistsAndDefaultsToPhoneOnly() {
        let app=XCUIApplication();app.launchArguments=["--uitest-public-fixture"];app.launch()
        XCTAssertTrue(app.buttons["Thêm tài khoản"].waitForExistence(timeout:10));app.buttons["Thêm tài khoản"].tap()
        app.buttons["Nhập thủ công"].tap()
        let issuer=app.textFields["Dịch vụ"];XCTAssertTrue(issuer.waitForExistence(timeout:5));issuer.tap();issuer.typeText("Example")
        let label=app.textFields["Tên tài khoản"];label.tap();label.typeText("alice@example.test")
        let secret=app.secureTextFields["Khóa bí mật Base32"];secret.tap();secret.typeText("JBSWY3DPEHPK3PXP")
        app.buttons["Tiếp tục"].tap()
        let save=app.buttons["Nhập 1 tài khoản"];XCTAssertTrue(save.waitForExistence(timeout:5));save.tap()
        XCTAssertTrue(app.staticTexts["alice@example.test"].waitForExistence(timeout:10))
        XCTAssertFalse(app.navigationBars["Thêm tài khoản"].exists)
        app.tabBars.buttons["Band"].tap()
        XCTAssertTrue(app.staticTexts["0 / 50"].waitForExistence(timeout:5))
    }
    func testAccountsAndImportWorkflow() {
        let app=XCUIApplication();app.launchArguments=["--uitest-public-fixture"];app.launch()
        XCTAssertTrue(app.staticTexts["RFC 6238"].waitForExistence(timeout:10))
        let shot=XCTAttachment(screenshot:app.screenshot());shot.name="Accounts";shot.lifetime = .keepAlways;add(shot)
        app.buttons["Thêm tài khoản"].tap()
        XCTAssertTrue(app.buttons["Nhập thủ công"].waitForExistence(timeout:5))
        app.buttons["Nhập thủ công"].tap()
        XCTAssertTrue(app.textFields["Tên tài khoản"].waitForExistence(timeout:5))
        let manual=XCTAttachment(screenshot:app.screenshot());manual.name="Manual";manual.lifetime = .keepAlways;add(manual)
        XCUIDevice.shared.press(.home);app.activate()
        XCTAssertTrue(app.buttons["Mở khóa"].waitForExistence(timeout:10))
        XCTAssertFalse(app.textFields["Tên tài khoản"].exists)
        XCTAssertFalse(app.staticTexts["Public test vector"].exists)
    }
}

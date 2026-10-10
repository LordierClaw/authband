import XCTest
final class WorkflowTests:XCTestCase {
    func testAccountsAndImportWorkflow() {
        let app=XCUIApplication();app.launchArguments=["--uitest-public-fixture"];app.launch()
        XCTAssertTrue(app.staticTexts["RFC 6238"].waitForExistence(timeout:10))
        let shot=XCTAttachment(screenshot:app.screenshot());shot.name="Accounts";shot.lifetime = .keepAlways;add(shot)
        app.buttons["Thêm tài khoản"].tap()
        XCTAssertTrue(app.buttons["Nhập thủ công"].waitForExistence(timeout:5))
        app.buttons["Nhập thủ công"].tap()
        XCTAssertTrue(app.textFields["Tên tài khoản"].waitForExistence(timeout:5))
    }
}

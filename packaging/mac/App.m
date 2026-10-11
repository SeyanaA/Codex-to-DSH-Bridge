#import <Cocoa/Cocoa.h>

@interface BridgeApp : NSObject <NSApplicationDelegate>
@property(strong) NSWindow *window;
@end

@implementation BridgeApp
- (void)applicationDidFinishLaunching:(NSNotification *)notice {
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 560, 400)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable
        backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Codex-to-DSH Bridge";
    [self.window center];
    NSTextField *title = [NSTextField labelWithString:@"Codex × DeepSeek"];
    title.font = [NSFont boldSystemFontOfSize:24];
    title.frame = NSMakeRect(32, 335, 490, 36);
    [self.window.contentView addSubview:title];
    NSTextField *description = [NSTextField wrappingLabelWithString:
        @"把适合的任务交给 DeepSeek，在 DSH 网页里查看进度。\n预览版 · 待实机测试 · 默认端口 3080"];
    description.frame = NSMakeRect(32, 266, 490, 58);
    [self.window.contentView addSubview:description];
    NSArray *titles = @[@"1. 安装与配置", @"2. 启动 DSH Web", @"打开网页", @"停止本程序的服务", @"诊断", @"使用说明"];
    for (NSInteger i = 0; i < titles.count; i++) {
        NSButton *button = [NSButton buttonWithTitle:titles[i] target:self action:@selector(performAction:)];
        button.tag = i;
        button.bezelStyle = NSBezelStyleRounded;
        button.frame = NSMakeRect(32 + (i % 2) * 254, 213 - (i / 2) * 61, 236, 42);
        [self.window.contentView addSubview:button];
    }
    NSTextField *foot = [NSTextField wrappingLabelWithString:
        @"需要事先安装 Node.js 24+、DSH CLI、pnpm 和 Codex。\n操作会打开终端窗口；不会替你关闭已有的 DSH 服务。"];
    foot.font = [NSFont systemFontOfSize:12];
    foot.textColor = [NSColor secondaryLabelColor];
    foot.frame = NSMakeRect(32, 20, 496, 52);
    [self.window.contentView addSubview:foot];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}
- (void)performAction:(NSButton *)sender {
    NSString *resources = [NSBundle mainBundle].resourcePath;
    NSArray *commands = @[@"install", @"start", @"open", @"stop", @"doctor"];
    if (sender.tag == 5) {
        [[NSWorkspace sharedWorkspace] openURL:[NSURL fileURLWithPath:[resources stringByAppendingPathComponent:@"payload/README.md"]]];
        return;
    }
    NSString *command = [resources stringByAppendingPathComponent:[commands[sender.tag] stringByAppendingString:@".command"]];
    [[NSWorkspace sharedWorkspace] openURL:[NSURL fileURLWithPath:command]];
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        BridgeApp *delegate = [[BridgeApp alloc] init];
        app.delegate = delegate;
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        NSMenu *menu = [[NSMenu alloc] init];
        NSMenuItem *item = [[NSMenuItem alloc] init];
        [menu addItem:item];
        NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"Bridge"];
        [appMenu addItemWithTitle:@"退出" action:@selector(terminate:) keyEquivalent:@"q"];
        item.submenu = appMenu;
        app.mainMenu = menu;
        [app run];
    }
    return 0;
}

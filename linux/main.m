// 去广告 WebView 壳 —— ObjC 版（Linux 交叉编译，不需要 Mac）
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <Foundation/Foundation.h>

static NSString *const kTargetURL = @"https://5agh2k05web.yqsudp.com/?c=hgti&x=hkyoNWHktEG8B9dRVNm7i7mNt%2Fb1XLaxCutlSK7qpQ8%3D&id=1fde65665c160ef861052374818fe052&h=904cdc4ef55a0390f79ee05cddbb1285a426bab1f16de0e015f395aa852f797c&conf_version=4";
static NSString *const kUA = @"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

@interface DeadLog : NSObject <WKScriptMessageHandler>
@end

@implementation DeadLog
- (void)userContentController:(WKUserContentController *)ucc didReceiveScriptMessage:(WKScriptMessage *)message {
    NSLog(@"[deads] %@", message.body);
}
@end

@interface ShellVC : UIViewController <WKNavigationDelegate, WKUIDelegate>
@property (nonatomic, strong) WKWebView *web;
@end

@implementation ShellVC

- (BOOL)prefersStatusBarHidden { return NO; }
- (UIStatusBarStyle)preferredStatusBarStyle { return UIStatusBarStyleLightContent; }

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor blackColor];

    WKWebViewConfiguration *cfg = [[WKWebViewConfiguration alloc] init];
    cfg.allowsInlineMediaPlayback = YES;
    if (@available(iOS 10.0, *)) {
        cfg.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
    }
    if (@available(iOS 13.0, *)) {
        cfg.defaultWebpagePreferences.allowsContentJavaScript = YES;
    }
    cfg.preferences.javaScriptCanOpenWindowsAutomatically = YES;

    NSString *jsPath = [[NSBundle mainBundle] pathForResource:@"inject" ofType:@"js"];
    if (jsPath) {
        NSString *js = [NSString stringWithContentsOfFile:jsPath encoding:NSUTF8StringEncoding error:NULL];
        if (js.length) {
            WKUserScript *us = [[WKUserScript alloc] initWithSource:js
                                                      injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                                   forMainFrameOnly:NO];
            [cfg.userContentController addUserScript:us];
        }
    }
    [cfg.userContentController addScriptMessageHandler:[[DeadLog alloc] init] name:@"deadsLog"];

    self.web = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:cfg];
    self.web.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.web.navigationDelegate = self;
    self.web.UIDelegate = self;
    self.web.opaque = NO;
    self.web.backgroundColor = [UIColor blackColor];
    self.web.scrollView.backgroundColor = [UIColor blackColor];
    self.web.allowsBackForwardNavigationGestures = YES;
    [self.view addSubview:self.web];

    NSString *rulesPath = [[NSBundle mainBundle] pathForResource:@"adblock" ofType:@"json"];
    NSString *rules = rulesPath ? [NSString stringWithContentsOfFile:rulesPath encoding:NSUTF8StringEncoding error:NULL] : nil;

    __weak typeof(self) weakSelf = self;
    if (rules.length) {
        [[WKContentRuleListStore defaultStore] compileContentRuleListForIdentifier:@"deads"
                                                          encodedContentRuleList:rules
                                                                completionHandler:^(WKContentRuleList *list, NSError *err) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (list) {
                    [[weakSelf.web configuration].userContentController addContentRuleList:list];
                    NSLog(@"[deads] content rules loaded");
                } else {
                    NSLog(@"[deads] rule compile failed: %@", err);
                }
                [weakSelf loadTarget];
            });
        }];
    } else {
        [self loadTarget];
    }
}

- (void)loadTarget {
    NSURL *url = [NSURL URLWithString:kTargetURL];
    if (!url) { return; }
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    [req setValue:kUA forHTTPHeaderField:@"User-Agent"];
    req.timeoutInterval = 30;
    [self.web loadRequest:req];
}

#pragma mark - WKNavigationDelegate

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    NSLog(@"[deads] loaded: %@", webView.URL.absoluteString);
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSLog(@"[deads] load failed: %@", error);
    if (error.code == NSURLErrorCancelled) { return; }
    [self showError:error.localizedDescription];
}

- (void)showError:(NSString *)msg {
    if (self.presentedViewController) { return; }
    UIAlertController *ac = [UIAlertController alertControllerWithTitle:@"加载失败"
                                                               message:msg
                                                        preferredStyle:UIAlertControllerStyleAlert];
    __weak typeof(self) weakSelf = self;
    [ac addAction:[UIAlertAction actionWithTitle:@"重试" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        [weakSelf loadTarget];
    }]];
    [ac addAction:[UIAlertAction actionWithTitle:@"关闭" style:UIAlertActionStyleCancel handler:nil]];
    [self presentViewController:ac animated:YES completion:nil];
}

#pragma mark - WKUIDelegate

- (WKWebView *)webView:(WKWebView *)webView
createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration
           forNavigationAction:(WKNavigationAction *)navigationAction
                windowFeatures:(WKWindowFeatures *)windowFeatures {
    if (navigationAction.targetFrame == nil && navigationAction.request.URL) {
        [webView loadRequest:navigationAction.request];
    }
    return nil;
}

@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    self.window.backgroundColor = [UIColor blackColor];
    self.window.rootViewController = [[ShellVC alloc] init];
    [self.window makeKeyAndVisible];
    return YES;
}

@end

int main(int argc, char *argv[]) {
    @autoreleasepool {
        return UIApplicationMain(argc, argv, nil, NSStringFromClass([AppDelegate class]));
    }
}

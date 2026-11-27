// DeAds shell — Objective-C, cross-compiled on Linux (no Xcode needed)
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <Foundation/Foundation.h>

// Built-in default; real list comes from the remote config
static NSString *const kDefaultTarget = @"https://myzys.cc/";
static NSString *const kConfigURL = @"https://cdn.jsdelivr.net/gh/yuyuyutyu/deads-shell@main/deads-myzys.json";
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
@property (nonatomic, strong) UITextView *debugView;
@property (nonatomic, copy) NSArray *targets;
@property (nonatomic) NSInteger targetIndex;
@property (nonatomic) BOOL autoRetried;
@property (nonatomic, copy) NSString *configPrefix;
@end

@implementation ShellVC

- (BOOL)prefersStatusBarHidden { return NO; }
- (UIStatusBarStyle)preferredStatusBarStyle { return UIStatusBarStyleLightContent; }

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor blackColor];
    self.targets = @[ kDefaultTarget ];
    self.targetIndex = 0;
    self.configPrefix = @"window.__deadsConfig = {};\n";
    [self fetchConfig];
}

- (void)fetchConfig {
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:kConfigURL]];
    req.timeoutInterval = 4;
    req.cachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
    __weak typeof(self) weakSelf = self;
    [[[NSURLSession sharedSession] dataTaskWithRequest:req
                                   completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
        NSDictionary *cfg = nil;
        if (data.length) {
            id obj = [NSJSONSerialization JSONObjectWithData:data options:0 error:NULL];
            if ([obj isKindOfClass:[NSDictionary class]]) { cfg = obj; }
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf applyConfig:cfg];
        });
    }] resume];
}

- (void)applyConfig:(NSDictionary *)cfg {
    NSArray *list = cfg[@"targets"];
    NSMutableArray *t = [NSMutableArray array];
    if ([list isKindOfClass:[NSArray class]]) {
        for (id u in list) {
            if ([u isKindOfClass:[NSString class]] && ((NSString *)u).length > 8) { [t addObject:u]; }
        }
    }
    if (t.count == 0) { [t addObject:kDefaultTarget]; }
    self.targets = t;
    self.targetIndex = 0;

    NSData *json = cfg ? [NSJSONSerialization dataWithJSONObject:cfg options:0 error:NULL] : nil;
    NSString *jsonStr = json ? [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding] : @"{}";
    self.configPrefix = [NSString stringWithFormat:@"window.__deadsConfig = %@;\n", jsonStr ?: @"{}"];
    [self setupWebView];
}

- (void)setupWebView {
    if (self.web) { [self.web removeFromSuperview]; self.web = nil; }

    WKWebViewConfiguration *cfg = [[WKWebViewConfiguration alloc] init];
    cfg.allowsInlineMediaPlayback = YES;
    if (@available(iOS 10.0, *)) { cfg.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone; }
    if (@available(iOS 13.0, *)) { cfg.defaultWebpagePreferences.allowsContentJavaScript = YES; }
    cfg.preferences.javaScriptCanOpenWindowsAutomatically = YES;

    NSString *jsPath = [[NSBundle mainBundle] pathForResource:@"inject" ofType:@"js"];
    if (jsPath) {
        NSString *js = [NSString stringWithContentsOfFile:jsPath encoding:NSUTF8StringEncoding error:NULL];
        if (js.length) {
            NSString *full = [self.configPrefix stringByAppendingString:js];
            WKUserScript *us = [[WKUserScript alloc] initWithSource:full
                                                      injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                                   forMainFrameOnly:YES];
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

    UITapGestureRecognizer *triple = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(onTripleTap:)];
    triple.numberOfTapsRequired = 3;
    triple.cancelsTouchesInView = NO;
    [self.web addGestureRecognizer:triple];

    NSString *rulesPath = [[NSBundle mainBundle] pathForResource:@"adblock" ofType:@"json"];
    NSString *rules = rulesPath ? [NSString stringWithContentsOfFile:rulesPath encoding:NSUTF8StringEncoding error:NULL] : nil;

    __weak typeof(self) weakSelf = self;
    if (rules.length) {
        [[WKContentRuleListStore defaultStore] compileContentRuleListForIdentifier:@"deads"
                                                          encodedContentRuleList:rules
                                                                completionHandler:^(WKContentRuleList *list, NSError *err) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (list) { [[weakSelf.web configuration].userContentController addContentRuleList:list]; }
                [weakSelf loadTarget];
            });
        }];
    } else {
        [self loadTarget];
    }
}

- (NSString *)hostOfTargets {
    NSString *base = self.targets.count ? self.targets[0] : kDefaultTarget;
    return [NSURL URLWithString:base].host.lowercaseString ?: @"";
}

- (BOOL)isAllowedHost:(NSString *)host {
    if (host.length == 0) { return YES; }
    NSString *appHost = [self hostOfTargets];
    if (appHost.length == 0) { return YES; }
    if ([host isEqualToString:appHost]) { return YES; }
    if ([host hasSuffix:[@"." stringByAppendingString:appHost]]) { return YES; }
    if ([host hasSuffix:@"itguru.tw"]) { return YES; }
    if ([host hasSuffix:@"jsdelivr.net"]) { return YES; }
    return NO;
}

- (void)onTripleTap:(UITapGestureRecognizer *)g {
    if (self.debugView) { [self.debugView removeFromSuperview]; self.debugView = nil; return; }
    __weak typeof(self) weakSelf = self;
    [self.web evaluateJavaScript:@"window.__deadsReport ? window.__deadsReport() : 'no report fn'"
               completionHandler:^(id result, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            UITextView *tv = [[UITextView alloc] initWithFrame:UIEdgeInsetsInsetRect(weakSelf.view.bounds, UIEdgeInsetsMake(60, 12, 60, 12))];
            tv.backgroundColor = [UIColor colorWithWhite:0 alpha:0.92];
            tv.textColor = [UIColor greenColor];
            tv.font = [UIFont fontWithName:@"Menlo" size:9] ?: [UIFont systemFontOfSize:9];
            tv.editable = NO;
            tv.text = error ? [NSString stringWithFormat:@"ERR %@", error] : [NSString stringWithFormat:@"%@", result];
            tv.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
            [weakSelf.view addSubview:tv];
            weakSelf.debugView = tv;
        });
    }];
}

- (void)loadTarget {
    if (self.targetIndex >= (NSInteger)self.targets.count) {
        [self showError:@"所有备用地址都打不开"];
        return;
    }
    NSString *u = self.targets[self.targetIndex];
    NSURL *url = [NSURL URLWithString:u];
    if (!url) { self.targetIndex++; [self loadTarget]; return; }
    NSLog(@"[deads] load #%ld %@", (long)self.targetIndex, u);
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    [req setValue:kUA forHTTPHeaderField:@"User-Agent"];
    req.timeoutInterval = 60;
    [self.web loadRequest:req];
}

- (void)showError:(NSString *)msg {
    if (self.presentedViewController) { return; }
    UIAlertController *ac = [UIAlertController alertControllerWithTitle:@"加载失败" message:msg preferredStyle:UIAlertControllerStyleAlert];
    __weak typeof(self) weakSelf = self;
    [ac addAction:[UIAlertAction actionWithTitle:@"重试" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        weakSelf.targetIndex = 0;
        [weakSelf loadTarget];
    }]];
    [ac addAction:[UIAlertAction actionWithTitle:@"关闭" style:UIAlertActionStyleCancel handler:nil]];
    [self presentViewController:ac animated:YES completion:nil];
}

#pragma mark - WKNavigationDelegate

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    NSString *host = url.host.lowercaseString ?: @"";
    if (navigationAction.targetFrame.isMainFrame && !navigationAction.targetFrame.request && host.length > 0) {
        if (![self isAllowedHost:host]) {
            NSLog(@"[deads] BLOCK navigation -> %@", url.absoluteString);
            decisionHandler(WKNavigationActionPolicyCancel);
            return;
        }
    } else if (navigationAction.targetFrame.isMainFrame && host.length > 0) {
        if (![self isAllowedHost:host]) {
            NSLog(@"[deads] BLOCK navigation -> %@", url.absoluteString);
            decisionHandler(WKNavigationActionPolicyCancel);
            return;
        }
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    NSLog(@"[deads] loaded: %@", webView.URL.absoluteString);
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSLog(@"[deads] load failed: %@", error);
    if (error.code == NSURLErrorCancelled) { return; }
    if (error.code == NSURLErrorTimedOut && !self.autoRetried) {
        self.autoRetried = YES;
        NSLog(@"[deads] timeout -> automatic retry once");
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self loadTarget];
        });
        return;
    }
    if (self.targetIndex + 1 < (NSInteger)self.targets.count) {
        self.targetIndex++;
        [self loadTarget];
        return;
    }
    [self showError:error.localizedDescription];
}

#pragma mark - WKUIDelegate

- (WKWebView *)webView:(WKWebView *)webView
createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration
           forNavigationAction:(WKNavigationAction *)navigationAction
                windowFeatures:(WKWindowFeatures *)windowFeatures {
    NSURL *url = navigationAction.request.URL;
    if (url && [self isAllowedHost:url.host.lowercaseString ?: @""]) {
        [webView loadRequest:navigationAction.request];
    } else if (url) {
        NSLog(@"[deads] BLOCK popup -> %@", url.absoluteString);
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

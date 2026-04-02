# 🚀 FiftyList App Store Submission Guide

## 📋 Prerequisites

### 1. Apple Developer Account
- Active Apple Developer Program membership ($99/year)
- Access to App Store Connect
- Signing certificates and provisioning profiles

### 2. App Store Connect Setup
- Create a new app in App Store Connect
- Get your App Store Connect App ID (ascAppId)
- Note your Apple Team ID

## 🛠️ Build Configuration

### Current Configuration
- **Bundle ID**: `com.chrisgunn.fiftylist`
- **Version**: 1.0.0
- **Build Number**: 1
- **Project ID**: 342e8c02-6906-49e2-b4ab-85056efbf2aa

### Files Updated
- ✅ `app.json` - Production app configuration
- ✅ `eas.json` - Build and submit configuration

## 📱 App Store Assets Needed

### Screenshots (Required)
- iPhone 6.7" (iPhone 14 Pro Max, iPhone 15 Pro Max)
- iPhone 6.5" (iPhone 11 Pro Max, iPhone 12 Pro Max, iPhone 13 Pro Max, iPhone 14 Plus, iPhone 15 Plus)
- iPhone 5.5" (iPhone 8 Plus, iPhone 7 Plus, iPhone 6s Plus)
- iPad Pro 12.9" (6th generation)
- iPad Pro 12.9" (5th generation)

### App Store Listing
- **App Name**: FiftyList
- **Subtitle**: Track Your Reading & Watching Goals
- **Description**: 
```
FiftyList is your personal companion for tracking books and movies. Set yearly goals, organize your reading and watching lists, and discover new content through intelligent suggestions.

FEATURES:
• Set and track yearly reading/watching goals
• Organize books and movies by status (completed, reading, planned, stopped)
• Import your existing lists from text
• Export your data for backup or sharing
• Smart suggestions based on your preferences
• Beautiful, intuitive interface
• Local data storage - your privacy matters

Perfect for book clubs, movie enthusiasts, and anyone who loves to track their media consumption. Start your journey to 50 books and 50 movies this year!
```

- **Keywords**: reading,books,movies,tracking,goals,list,organizer,library,media,bookshelf
- **Category**: Productivity
- **Content Rating**: 4+ (No objectionable content)

## 🔧 Build Commands

### Install EAS CLI (when disk space available)
```bash
npm install -g eas-cli
```

### Login to Expo
```bash
eas login
```

### Configure Build
```bash
eas build:configure
```

### Build for Production
```bash
eas build --platform ios --profile production
```

### Submit to App Store
```bash
eas submit --platform ios --profile production
```

## 📝 App Store Connect Checklist

### App Information
- [ ] App name and subtitle
- [ ] Description and keywords
- [ ] Category and content rating
- [ ] Privacy policy URL
- [ ] Support URL

### Screenshots & Media
- [ ] App screenshots for all required sizes
- [ ] App preview videos (optional)
- [ ] App icon (1024x1024)

### App Review Information
- [ ] Contact information
- [ ] Demo account (if needed)
- [ ] Review notes explaining app functionality

### Pricing & Availability
- [ ] Price tier (Free)
- [ ] Availability in countries
- [ ] Release date

## 🔐 Privacy & Legal

### Privacy Policy
Create a simple privacy policy stating:
- Data is stored locally on device
- No data is collected or shared
- No third-party tracking

### App Store Guidelines Compliance
- [ ] No objectionable content
- [ ] Proper app categorization
- [ ] Accurate app description
- [ ] Working app functionality

## 🚀 Submission Process

1. **Build the App**
   ```bash
   eas build --platform ios --profile production
   ```

2. **Update App Store Connect**
   - Fill in all required information
   - Upload screenshots
   - Set pricing and availability

3. **Submit for Review**
   ```bash
   eas submit --platform ios --profile production
   ```

4. **Monitor Review Status**
   - Check App Store Connect for review status
   - Respond to any review feedback
   - Approve for release when approved

## 📞 Support

For issues with:
- **EAS Build**: Check Expo documentation
- **App Store Review**: Contact Apple Developer Support
- **App Store Connect**: Use App Store Connect Help

## 🎯 Next Steps

1. **Free up disk space** to install EAS CLI
2. **Create App Store Connect app** and get your IDs
3. **Take screenshots** of your app on different devices
4. **Write privacy policy** and support information
5. **Build and submit** your app

Good luck with your App Store submission! 🎉

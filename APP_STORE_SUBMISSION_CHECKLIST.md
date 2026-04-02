# 📱 FiftyList App Store Submission Checklist

## ✅ **Pre-Submission Tasks**

### **1. App Store Connect Setup**
- [ ] Create new app in App Store Connect
- [ ] Get App Store Connect App ID (ascAppId)
- [ ] Update `eas.json` with ascAppId
- [ ] Verify bundle ID: `com.chrisgunn.fiftylist`

### **2. App Information**
- [ ] **App Name**: FiftyList
- [ ] **Subtitle**: Track Your Reading & Watching Goals
- [ ] **Category**: Productivity
- [ ] **Content Rating**: 4+ (No objectionable content)
- [ ] **Price**: Free

### **3. App Store Listing Content**

#### **Description** (Copy this exactly):
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

#### **Keywords**:
```
reading,books,movies,tracking,goals,list,organizer,library,media,bookshelf
```

#### **Support URL**: 
```
https://fiftylist.app/support
```

#### **Privacy Policy URL**:
```
https://fiftylist.app/privacy
```

### **4. Screenshots Required**
- [ ] iPhone 6.7" (iPhone 14 Pro Max, iPhone 15 Pro Max)
- [ ] iPhone 6.5" (iPhone 11 Pro Max, iPhone 12 Pro Max, iPhone 13 Pro Max, iPhone 14 Plus, iPhone 15 Plus)
- [ ] iPhone 5.5" (iPhone 8 Plus, iPhone 7 Plus, iPhone 6s Plus)
- [ ] iPad Pro 12.9" (6th generation)
- [ ] iPad Pro 12.9" (5th generation)

**Screenshot Content Suggestions**:
1. Main books screen with completed books
2. Movies screen with movie list
3. Goals progress screen
4. Add/edit book modal
5. Import/export functionality
6. Suggestions screen

### **5. App Review Information**
- [ ] **Contact Information**: 
  - First Name: Christopher
  - Last Name: Gunn
  - Phone: [Your phone number]
  - Email: cagunn@gmail.com
- [ ] **Demo Account**: Not required (app works offline)
- [ ] **Review Notes**: 
  ```
  FiftyList is a personal reading and movie tracking app. All data is stored locally on the user's device. The app allows users to set yearly goals, track completed books/movies, and organize their media consumption. No login required, works completely offline.
  ```

## 🚀 **Submission Process**

### **Step 1: Update eas.json**
Replace `YOUR_APP_STORE_CONNECT_APP_ID` in `eas.json` with your actual App Store Connect App ID.

### **Step 2: Submit to App Store**
```bash
eas submit --platform ios --profile production
```

### **Step 3: App Store Connect Setup**
1. Go to App Store Connect
2. Fill in all app information
3. Upload screenshots
4. Set pricing to Free
5. Configure availability
6. Submit for review

## 📋 **Post-Submission**

### **Review Process**
- [ ] Monitor review status in App Store Connect
- [ ] Respond to any review feedback
- [ ] Approve for release when approved

### **Release**
- [ ] Set release date
- [ ] Monitor app performance
- [ ] Respond to user reviews

## 🔗 **Useful Links**

- **App Store Connect**: https://appstoreconnect.apple.com
- **Apple Developer**: https://developer.apple.com
- **EAS Build**: https://expo.dev/build
- **Expo Documentation**: https://docs.expo.dev

## 📞 **Support**

For issues with:
- **EAS Build**: Check Expo documentation
- **App Store Review**: Contact Apple Developer Support
- **App Store Connect**: Use App Store Connect Help

---

**Good luck with your App Store submission! 🎉**

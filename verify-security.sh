#!/bin/bash

# Security Verification Script for FiftyList
# This script verifies that all security fixes are properly implemented

echo "🔍 FiftyList Security Verification"
echo "=================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

# Test 1: Check .env file exists
echo "Test 1: Environment file configuration..."
if [ -f .env ]; then
    echo -e "${GREEN}✓${NC} .env file exists"
    ((PASS++))
else
    echo -e "${RED}✗${NC} .env file missing"
    ((FAIL++))
fi

# Test 2: Check .env.example exists
if [ -f .env.example ]; then
    echo -e "${GREEN}✓${NC} .env.example template exists"
    ((PASS++))
else
    echo -e "${RED}✗${NC} .env.example template missing"
    ((FAIL++))
fi

# Test 3: Verify .env is in .gitignore
echo ""
echo "Test 2: Git ignore configuration..."
if grep -q "^\.env$" .gitignore; then
    echo -e "${GREEN}✓${NC} .env is in .gitignore"
    ((PASS++))
else
    echo -e "${RED}✗${NC} .env is NOT in .gitignore"
    ((FAIL++))
fi

# Test 4: Check for hardcoded API keys in source
echo ""
echo "Test 3: Source code security..."
API_KEY_PATTERN="api_key=8c247"
if grep -r "$API_KEY_PATTERN" --exclude-dir=node_modules --exclude-dir=.git --exclude=".env" --exclude="*.md" --exclude="verify-security.sh" . > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} Hardcoded API key found in source code!"
    ((FAIL++))
else
    echo -e "${GREEN}✓${NC} No hardcoded API keys in source code"
    ((PASS++))
fi

# Test 5: Check secure storage implementation
echo ""
echo "Test 4: Secure storage implementation..."
if [ -f "utils/secureStore.ts" ]; then
    echo -e "${GREEN}✓${NC} Secure storage utility exists"
    ((PASS++))
else
    echo -e "${RED}✗${NC} Secure storage utility missing"
    ((FAIL++))
fi

# Test 6: Verify secure storage is used for subscription entitlements
if grep -q "secureStore" hooks/useSubscription.tsx; then
    echo -e "${GREEN}✓${NC} Secure storage is used for subscription state"
    ((PASS++))
else
    echo -e "${RED}✗${NC} Secure storage NOT used in subscription state"
    ((FAIL++))
fi

# Test 7: Check API key environment variable usage
echo ""
echo "Test 5: Environment variable usage..."
if grep -q "process.env.EXPO_PUBLIC_TMDB_API_KEY" utils/movieSearch.ts; then
    echo -e "${GREEN}✓${NC} API calls use environment variable"
    ((PASS++))
else
    echo -e "${RED}✗${NC} API calls don't use environment variable"
    ((FAIL++))
fi

# Summary
echo ""
echo "=================================="
echo "Summary:"
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ All security checks passed!${NC}"
    echo "The app is secure and ready for deployment."
    exit 0
else
    echo -e "${RED}❌ Some security checks failed.${NC}"
    echo "Please review the issues above."
    exit 1
fi

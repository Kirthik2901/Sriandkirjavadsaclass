import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';
import { HeroCarouselComponent } from './shared/components/home/hero-carousel/hero-carousel.component';
import { HomeComponent } from './shared/components/home/home/home.component';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'login', 
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },  
  {  
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
  },

  {
    path: 'wishlist',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/components/wishlist/wishlist.component').then(m => m.WishlistComponent)
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/components/checkout/checkout.component').then(m => m.CheckoutComponent)
  },
  {
    path: 'orders',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/components/order-list/order-list.component').then(m => m.OrdersListComponent)
  },
  {
    path: 'replacements',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/components/replacement-list/replacement-list.component').then(m => m.ReplacementListComponent)
  },
  // Add these routes to your app.routes.ts
{
  path: ':username/refer/:code',
  loadComponent: () => import('./shared/components/referral-landing/referral-landing.component')
    .then(m => m.ReferralLandingComponent)
},
{
  path: ':username/refer/:code/:slug',
  loadComponent: () => import('./shared/components/referral-landing/referral-landing.component')
    .then(m => m.ReferralLandingComponent)
},
  {
    path: 'orders/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/components/order-detail/order-detail.component').then(m => m.OrderDetailComponent)
  },
    {
    path: 'about',
    loadComponent: () => import('./shared/components/about-us/about-us.component').then(m => m.AboutUsComponent)
  },
   {
    path: 'contact',
    loadComponent: () => import('./shared/components/contact-us/contact-us.component').then(m => m.ContactUsComponent)
  },
  // Blog routes
  {
    path: 'blogs',
    loadComponent: () => import('./shared/components/blog-list/blog-list.component').then(m => m.PublicBlogListComponent)
  },
  {
    path: 'blogs/:slug',
    loadComponent: () => import('./shared/components/blog-detail/blog-detail.component').then(m => m.BlogDetailComponent)
  },
  
  // Product routes - SPECIFIC FIRST (new-arrivals before :id)
  {
    path: 'products/new-arrivals',
    loadComponent: () => import('./shared/components/product-list/product-list.component').then(m => m.ProductListComponent)
  },
  {
    path: 'products',
    loadComponent: () => import('./shared/components/product-list/product-list.component').then(m => m.ProductListComponent)
  },
  {
    path: 'products/:id',
    loadComponent: () => import('./shared/components/product-detail/product-detail.component').then(m => m.ProductDetailComponent)
  },
  
  // Category routes with slugs - SPECIFIC FIRST
  {
    path: 'category/:categorySlug/:subCategorySlug/:subSubCategorySlug',
    loadComponent: () => import('./shared/components/product-list/product-list.component').then(m => m.ProductListComponent)
  },
  {
    path: 'category/:categorySlug/:subCategorySlug',
    loadComponent: () => import('./shared/components/product-list/product-list.component').then(m => m.ProductListComponent)
  },
  {
    path: 'category/:categorySlug',
    loadComponent: () => import('./shared/components/product-list/product-list.component').then(m => m.ProductListComponent)
  },
  {
    path: 'profile',
    loadComponent: () => import('./shared/components/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard]
  },
  
  // Admin routes
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/admin-layout/admin-layout.component').then(m => m.AdminLayoutComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/admin/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'users',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/user-management/user-management.component').then(m => m.UserManagementComponent)
      },
      {
        path: 'orders',
        loadComponent: () => import('./features/admin/order-management/order-management.component').then(m => m.OrderManagementComponent)
      },
      {
        path: 'replacement-requests',
        loadComponent: () => import('./features/admin/replacement-management/replacement-management.component').then(m => m.ReplacementManagementComponent)
      },
      {
        path: 'analytics',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/analytics/analytics.component').then(m => m.AnalyticsComponent)
      },
      {
        path: 'products',
        loadComponent: () => import('./features/admin/product-list/product-list.component').then(m => m.ProductListComponent)
      },
      {
        path: 'products/create',
        loadComponent: () => import('./features/admin/product-form/product-form.component').then(m => m.ProductFormComponent)
      },
      {
        path: 'products/edit/:id',
        loadComponent: () => import('./features/admin/product-form/product-form.component').then(m => m.ProductFormComponent)
      },
      {
        path: 'categories',
        loadComponent: () => import('./features/admin/category-management/category-management.component').then(m => m.CategoryManagementComponent)
      },
      {
        path: 'blogs',
        loadComponent: () => import('./features/admin/blog-list/blog-list.component').then(m => m.BlogListComponent)
      },
      {
        path: 'blogs/create',
        loadComponent: () => import('./features/admin/blog-form/blog-form.component').then(m => m.BlogFormComponent)
      },
      {
        path: 'blogs/edit/:id',
        loadComponent: () => import('./features/admin/blog-form/blog-form.component').then(m => m.BlogFormComponent)
      },
      {
        path: 'tags',
        loadComponent: () => import('./features/admin/tag-list/tag-list.component').then(m => m.TagListComponent)
      },
      {
        path: 'tags/create',
        loadComponent: () => import('./features/admin/tag-form/tag-form.component').then(m => m.TagFormComponent)
      },
      {
        path: 'tags/edit/:id',
        loadComponent: () => import('./features/admin/tag-form/tag-form.component').then(m => m.TagFormComponent)
      },
      {
        path: 'banners',
        loadComponent: () => import('./features/admin/banner-list/banner-list.component').then(m => m.BannerListComponent)
      },
      {
        path: 'banners/create',
        loadComponent: () => import('./features/admin/banner-form/banner-form.component').then(m => m.BannerFormComponent)
      },
      {
        path: 'banners/edit/:id',
        loadComponent: () => import('./features/admin/banner-form/banner-form.component').then(m => m.BannerFormComponent)
      },
      {
        path: 'header-offer',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/header-offer-form/header-offer-form.component').then(m => m.HeaderOfferFormComponent)
      },
      {
        path: 'coupons',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/coupon-management/coupon-management.component').then(m => m.CouponManagementComponent)
      },
    ]
  },
  
  {
    path: '**',
    redirectTo: ''
  }
];
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


class CustomUserAdmin(UserAdmin):
    """
    Extends Django's built-in UserAdmin so the admin panel also shows
    our custom fields: role, phone_number, address, is_active_account.
    """
    list_display = ('username', 'email', 'role', 'phone_number', 'is_active_account', 'is_staff')
    list_filter = ('role', 'is_active_account', 'is_staff')

    fieldsets = UserAdmin.fieldsets + (
        ('GLOMAX Info', {'fields': ('role', 'phone_number', 'address', 'is_active_account')}),
    )


admin.site.register(User, CustomUserAdmin)
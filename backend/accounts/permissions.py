"""
accounts/permissions.py

Custom role-based permission classes for GLOMAX.

DRF's built-in IsAuthenticated only checks "is this a logged-in user?" —
it doesn't care WHICH role that user has. These classes add that check,
based on the `role` field on the custom User model (CUSTOMER, STAFF,
PARTNER_INSTALLER, ADMIN).

Usage in a view:

    from accounts.permissions import IsStaff

    class AssignPartnerInstallerView(APIView):
        permission_classes = [IsStaff]
        ...

Each class below checks BOTH that the user is authenticated AND that
their role matches — so you don't need to also list IsAuthenticated
separately.
"""

from rest_framework import permissions


class IsCustomer(permissions.BasePermission):
    """Allows access only to users with role == CUSTOMER."""

    message = "Only Customer accounts can access this."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == 'CUSTOMER'
        )


class IsStaff(permissions.BasePermission):
    """Allows access only to users with role == STAFF."""

    message = "Only Staff accounts can access this."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == 'STAFF'
        )


class IsPartnerInstaller(permissions.BasePermission):
    """Allows access only to users with role == PARTNER_INSTALLER."""

    message = "Only Partner Installer accounts can access this."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == 'PARTNER_INSTALLER'
        )


class IsAdmin(permissions.BasePermission):
    """Allows access only to users with role == ADMIN."""

    message = "Only Admin accounts can access this."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == 'ADMIN'
        )


class IsStaffOrAdmin(permissions.BasePermission):
    """
    Allows access to Staff OR Admin.
    Useful for things like viewing tickets, since both roles need
    visibility into the review pipeline even though only one of them
    takes the final action at a given stage.
    """

    message = "Only Staff or Admin accounts can access this."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ('STAFF', 'ADMIN')
        )


class IsAccountOwner(permissions.BasePermission):
    """
    Object-level permission: only allows the request to proceed if the
    object being accessed belongs to the requesting user (e.g. a
    Customer viewing/editing their OWN ticket, not someone else's).

    Use this alongside an object-based view (has_object_permission is
    only called for detail views — retrieve/update/delete — not list
    or create). Assumes the object has a `customer` field pointing to
    a User, which matches the Ticket model.
    """

    message = "You do not have permission to access this record."

    def has_object_permission(self, request, view, obj):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(obj, 'customer_id', None) == request.user.id
        )


class IsAssignedPartnerInstaller(permissions.BasePermission):
    """
    Object-level permission: only allows the request to proceed if the
    object's `partner_installer` is the requesting user (e.g. a Partner
    Installer submitting an assessment for a ticket assigned to THEM,
    not someone else's ticket).

    Same pattern as IsAccountOwner, but for the partner_installer field
    instead of customer. Since this is used from a plain APIView (not
    a generic view), the view must call self.check_object_permissions()
    itself after fetching the object.
    """

    message = "This ticket is not assigned to you."

    def has_object_permission(self, request, view, obj):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(obj, 'partner_installer_id', None) == request.user.id
        )
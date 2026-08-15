from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    """
    Handles new Customer registration - matches the Customer Register Page
    (Full Name, Email, Phone Number, Address, Password, Confirm Password).
    """
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'phone_number', 'address', 'password', 'confirm_password']

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return data

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            phone_number=validated_data.get('phone_number', ''),
            address=validated_data.get('address', ''),
            password=validated_data['password'],
            role=User.Role.CUSTOMER,  # public registration is always a Customer
        )
        return user


class UserSerializer(serializers.ModelSerializer):
    """
    Used to send back logged-in user info (without the password) -
    React uses this to know the user's name, role, etc. Also used to
    UPDATE profile info (My Profile tab) and notification preferences
    (Notifications tab) via PATCH on /api/accounts/me/.
    """
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'phone_number',
            'address',
            'role',
            'profile_picture',
            'notify_email_updates',
            'notify_sms_updates',
            'notify_request_approval',
            'notify_request_rejection',
            'notify_promotions',
        ]
        # id and role are never editable by the user themselves - role
        # changes only happen through Admin actions elsewhere in the system
        read_only_fields = ['id', 'role']


from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class GlomaxTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom login serializer - adds 'role' and 'username' directly into
    the token response, so React knows which dashboard to show
    immediately after login, without a second API call.

    Also accepts EITHER an email OR a username in the same "username"
    field the login form submits (matches the login spec: "Email or
    Username, Password"). If the submitted value contains "@", it's
    treated as an email and swapped for the matching account's actual
    username before SimpleJWT's normal validation runs. If no account
    matches that email, we deliberately let validation continue and
    fail with SimpleJWT's normal "no active account" error, rather
    than revealing whether that email exists in the system.
    """

    def validate(self, attrs):
        login_field = self.username_field  # 'username' by default
        submitted_value = attrs.get(login_field)

        if submitted_value and '@' in submitted_value:
            try:
                matched_user = User.objects.get(email__iexact=submitted_value)
                attrs[login_field] = matched_user.username
            except User.DoesNotExist:
                pass  # fall through - normal invalid-credentials error will fire
            except User.MultipleObjectsReturned:
                pass  # ambiguous email match - fall through to normal error too

        data = super().validate(attrs)
        data['role'] = self.user.role
        data['username'] = self.user.username
        data['user_id'] = self.user.id
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['username'] = user.username
        return token


class StaffPartnerInstallerCreateSerializer(serializers.ModelSerializer):
    """
    Used by Admin to create a new Staff or Partner Installer account
    (Manage Staff / Manage Partner Installers pages' "Create New" form).
    `role` is NOT accepted here - it's set explicitly in the view
    depending on which endpoint was called, so an Admin can never
    accidentally create an ADMIN or CUSTOMER account through this form.
    """
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['username', 'email', 'phone_number', 'password']

    def create(self, validated_data):
        role = self.context['role']
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            phone_number=validated_data.get('phone_number', ''),
            password=validated_data['password'],
            role=role,
        )


class ManagedUserSerializer(serializers.ModelSerializer):
    """
    Read-only representation of a Staff/Partner Installer account for
    the Manage Staff / Manage Partner Installers table listing.
    """

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'phone_number',
            'address',
            'is_active',
        ]
        read_only_fields = fields


class GoogleLoginSerializer(serializers.Serializer):
    """
    Used by both the Login and Register pages' "Continue with Google" /
    "Sign up with Google" buttons. Accepts the ID token Google's frontend
    library hands back after the user picks an account - the actual
    verification of that token happens in the view, not here, since it
    requires calling out to Google's servers (not a pure data validation
    step).
    """
    id_token = serializers.CharField()
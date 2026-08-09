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
    React uses this to know the user's name, role, etc.
    """
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'phone_number', 'address', 'role']

from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class GlomaxTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom login serializer - adds 'role' and 'username' directly into
    the token response, so React knows which dashboard to show
    immediately after login, without a second API call.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['username'] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['role'] = self.user.role
        data['username'] = self.user.username
        data['user_id'] = self.user.id
        return data
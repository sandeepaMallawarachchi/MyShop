import Layout from "@/components/Layout";
import { getError } from "@/utils/error";
import { Store } from "@/utils/Store";
import axios from "axios";
import Cookies from "js-cookie";
import { signIn, signOut, useSession } from "next-auth/react";
import React, { useContext, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import zxcvbn from "zxcvbn";

export default function Profile() {
  const { data: session } = useSession();
  const [changePassword, setChangePassword] = useState(false);
  const [initialName, setInitialName] = useState("");

  const {
    handleSubmit,
    register,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    if (session?.user) {
      setValue("name", session.user.name);
      setValue("email", session.user.email);
      setInitialName(session.user.name || "");
    }
  }, [session, setValue]);

  // Watch form values for validation
  const nameValue = watch("name");
  const passwordValue = watch("password");
  const confirmPasswordValue = watch("confirmPassword");
  
  const passwordStrength = passwordValue ? zxcvbn(passwordValue) : { score: 0 };

  // Check if name has changed
  const hasNameChanged = nameValue !== initialName;

  // Check if password fields are valid and strong enough
  const isPasswordValid = changePassword ? (
    passwordValue && 
    confirmPasswordValue &&
    passwordValue === confirmPasswordValue &&
    passwordStrength.score >= 2
  ) : true;

  // Check if OTP button should be enabled (only for password change scenario)
  const isOtpButtonEnabled = changePassword && isPasswordValid;

  // Check if Save Changes button should be enabled
  const isSaveButtonEnabled = hasNameChanged || (changePassword && isPasswordValid);

  const strengthConfig = {
    0: { label: "Very Weak", color: "bg-red-500", textColor: "text-red-600" },
    1: { label: "Weak", color: "bg-orange-500", textColor: "text-orange-600" },
    2: { label: "Fair", color: "bg-yellow-500", textColor: "text-yellow-600" },
    3: { label: "Good", color: "bg-blue-500", textColor: "text-blue-600" },
    4: { label: "Strong", color: "bg-green-500", textColor: "text-green-600" },
  };

  const validatePassword = (password) => {
    if (!changePassword || !password) return true;
    const strength = zxcvbn(password);
    if (strength.score < 2) {
      return (
        strength.feedback.suggestions[0] ||
        "Password is too weak. Please choose a stronger one"
      );
    }
    return true;
  };

  const submitHandler = async ({ name, password }) => {
    try {
      await axios.put("/api/auth/update", {
        name,
        ...(changePassword && password ? { password } : {}),
      });

      toast.success("Profile updated successfully");

      if (changePassword && password) {
        const result = await signIn("credentials", {
          redirect: false,
          email: session.user.email,
          password,
        });
        if (result.error) {
          toast.error(result.error);
        }
        logoutClickHandler();
      }
    } catch (error) {
      toast.error(getError(error));
    }
  };

  const { dispatch } = useContext(Store);
  const logoutClickHandler = () => {
    Cookies.remove("cart");
    dispatch({ type: "CART_RESET" });
    signOut({ callbackUrl: "/login" });
  };

  const handleOtpRequest = async () => {
    try {
      // Add your OTP request logic here
      toast.info("OTP has been sent to your email");
    } catch (error) {
      toast.error("Failed to send OTP");
    }
  };

  // Reusable render function for password strength indicator
  const renderPasswordStrength = () => {
    if (!passwordValue) return null;
    const config = strengthConfig[passwordStrength.score];
    const widthPercentage = ((passwordStrength.score + 1) / 5) * 100;

    return (
      <div className="mt-2">
        <div className="flex justify-between items-center mb-1">
          <span className={`text-xs font-medium ${config.textColor}`}>
            Password Strength: {config.label}
          </span>
          <span className="text-xs text-gray-500">
            {passwordStrength.score < 2 ? "Too weak" : "Acceptable"}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${config.color}`}
            style={{ width: `${widthPercentage}%` }}
          />
        </div>
        {passwordStrength.feedback.suggestions.length > 0 && (
          <div className="mt-1">
            <p className="text-xs text-gray-600 font-medium">Suggestions:</p>
            <ul className="text-xs text-gray-600 list-disc list-inside ml-2">
              {passwordStrength.feedback.suggestions.map(
                (suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                )
              )}
            </ul>
          </div>
        )}
        {passwordStrength.feedback.warning && (
          <p className="text-xs text-orange-600 mt-1 flex items-center">
            <span className="mr-1">⚠️</span>
            {passwordStrength.feedback.warning}
          </p>
        )}
      </div>
    );
  };

  return (
    <Layout title="Profile">
      <div className="mx-auto max-w-screen-md">
        <div className="bg-white shadow-sm rounded-lg p-6">
          <h1 className="mb-6 text-2xl font-semibold text-gray-900">Update Profile</h1>

          <form onSubmit={handleSubmit(submitHandler)} className="space-y-6">
            {/* Name Field */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                {...register("name", { 
                  required: "Please enter your name",
                  minLength: {
                    value: 2,
                    message: "Name must be at least 2 characters long"
                  }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                id="name"
                autoFocus
                placeholder="Enter your full name"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            {/* Email Field - Disabled */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                {...register("email")}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md cursor-not-allowed text-gray-500"
                id="email"
                disabled
              />
              <p className="mt-1 text-xs text-gray-500">
                Email address cannot be changed for security reasons.
              </p>
            </div>

            {/* Password Change Toggle */}
            <div className="border-t pt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Password Settings</h3>
                {!changePassword ? (
                  <button
                    type="button"
                    onClick={() => setChangePassword(true)}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-transparent rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  >
                    Change Password
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setChangePassword(false)}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-transparent rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                  >
                    Cancel Password Change
                  </button>
                )}
              </div>
            </div>

            {/* Password Change Section */}
            {changePassword && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
                <h4 className="text-md font-medium text-gray-900 mb-4">Update Password</h4>
                
                {/* New Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    {...register("password", { validate: validatePassword })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    id="password"
                    placeholder="Enter new password"
                  />
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                  )}
                  {renderPasswordStrength()}
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    {...register("confirmPassword", {
                      validate: (value) =>
                        value === getValues("password") || "Passwords do not match",
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    id="confirmPassword"
                    placeholder="Confirm new password"
                  />
                  {errors.confirmPassword && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                  {confirmPasswordValue && passwordValue && confirmPasswordValue === passwordValue && (
                    <p className="mt-1 text-sm text-green-600 flex items-center">
                      <span className="mr-1">✓</span>
                      Passwords match
                    </p>
                  )}
                </div>

                {/* OTP Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleOtpRequest}
                    disabled={!isOtpButtonEnabled}
                    className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      isOtpButtonEnabled
                        ? "text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        : "text-gray-400 bg-gray-200 cursor-not-allowed"
                    }`}
                  >
                    Get OTP for Password Change
                  </button>
                  {!isOtpButtonEnabled && changePassword && (
                    <p className="mt-2 text-xs text-gray-500">
                      OTP button will be enabled when password is strong enough and passwords match.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Save Changes Button */}
            <div className="pt-6 border-t">
              <div className="flex items-center justify-between">
                <div>
                  {!isSaveButtonEnabled && (
                    <p className="text-sm text-gray-500">
                      {!hasNameChanged && !changePassword && "Make changes to your name or password to enable saving."}
                      {!hasNameChanged && changePassword && !isPasswordValid && "Complete password requirements to enable saving."}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!isSaveButtonEnabled}
                  className={`inline-flex items-center px-6 py-3 text-sm font-medium rounded-md transition-colors ${
                    isSaveButtonEnabled
                      ? "text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      : "text-gray-400 bg-gray-200 cursor-not-allowed"
                  }`}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}

Profile.auth = true;
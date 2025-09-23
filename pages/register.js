import Layout from "@/components/Layout";
import { getError } from "@/utils/error";
import axios from "axios";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import zxcvbn from "zxcvbn";

export default function Register() {
  const { data: session } = useSession();
  const router = useRouter();
  const { redirect } = router.query;

  useEffect(() => {
    if (session?.user) {
      router.push(redirect || "/");
    }
  }, [router, session, redirect]);

  const {
    register,
    handleSubmit,
    getValues,
    watch,
    formState: { errors },
  } = useForm();

  // Watch password for real-time strength checking
  const passwordValue = watch("password");
  const passwordStrength = passwordValue ? zxcvbn(passwordValue) : { score: 0 };

  // Password strength configurations
  const strengthConfig = {
    0: { label: "Very Weak", color: "bg-red-500", textColor: "text-red-600" },
    1: { label: "Weak", color: "bg-orange-500", textColor: "text-orange-600" },
    2: { label: "Fair", color: "bg-yellow-500", textColor: "text-yellow-600" },
    3: { label: "Good", color: "bg-blue-500", textColor: "text-blue-600" },
    4: { label: "Strong", color: "bg-green-500", textColor: "text-green-600" },
  };

  // Password validation function
  const validatePassword = (password) => {
    if (!password) return "Password is required";
    
    // Minimum length check
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    
    // Character type requirements
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const missingTypes = [];
    if (!hasUppercase) missingTypes.push("uppercase letter");
    if (!hasLowercase) missingTypes.push("lowercase letter");
    if (!hasNumbers) missingTypes.push("number");
    if (!hasSymbols) missingTypes.push("symbol");
    
    if (missingTypes.length > 0) {
      return `Password must contain at least one ${missingTypes.join(", ")}`;
    }
    
    // Check password strength using zxcvbn
    const strength = zxcvbn(password);
    if (strength.score < 2) {
      return "Password is too weak. Please choose a stronger password";
    }
    
    return true;
  };

  const submitHandler = async ({ name, email, password }) => {
    try {
      await axios.post("/api/auth/signup", { name, email, password });
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });
      if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(getError(error));
    }
  };

  // Render password strength indicator
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
            <p className="text-xs text-gray-600">Suggestions:</p>
            <ul className="text-xs text-gray-600 list-disc list-inside">
              {passwordStrength.feedback.suggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout title="Create Account">
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Create your account
            </h2>
          </div>

          <div className="bg-white shadow-lg rounded-lg px-8 pt-6 pb-8">
            <form onSubmit={handleSubmit(submitHandler)} className="space-y-6">
              {/* Name Field */}
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Full Name
                </label>
                <input
                  type="text"
                  {...register("name", { 
                    required: "Full name is required",
                    minLength: {
                      value: 2,
                      message: "Name must be at least 2 characters"
                    },
                    pattern: {
                      value: /^[a-zA-Z\s]+$/,
                      message: "Name can only contain letters and spaces"
                    }
                  })}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  id="name"
                  placeholder="Enter your full name"
                  autoFocus
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.name.message}
                  </p>
                )}
              </div>

              {/* Email Field */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email address
                </label>
                <input
                  type="email"
                  {...register("email", {
                    required: "Email address is required",
                    pattern: {
                      value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                      message: "Please enter a valid email address",
                    },
                  })}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  id="email"
                  placeholder="Enter your email"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password Field with Strength Indicator */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Password
                </label>
                <input
                  type="password"
                  {...register("password", {
                    validate: validatePassword
                  })}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  id="password"
                  placeholder="Enter your password"
                />
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.password.message}
                  </p>
                )}
                
                {/* Password Strength Indicator */}
                {renderPasswordStrength()}
                
                {/* Password Requirements */}
                <div className="mt-2">
                  <p className="text-xs text-gray-600 font-medium mb-1">Password must contain:</p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
                    <div className={`flex items-center ${passwordValue && passwordValue.length >= 8 ? 'text-green-600' : 'text-gray-500'}`}>
                      <span className="mr-1">{passwordValue && passwordValue.length >= 8 ? '✓' : '•'}</span>
                      8+ characters
                    </div>
                    <div className={`flex items-center ${passwordValue && /[A-Z]/.test(passwordValue) ? 'text-green-600' : 'text-gray-500'}`}>
                      <span className="mr-1">{passwordValue && /[A-Z]/.test(passwordValue) ? '✓' : '•'}</span>
                      Uppercase letter
                    </div>
                    <div className={`flex items-center ${passwordValue && /[a-z]/.test(passwordValue) ? 'text-green-600' : 'text-gray-500'}`}>
                      <span className="mr-1">{passwordValue && /[a-z]/.test(passwordValue) ? '✓' : '•'}</span>
                      Lowercase letter
                    </div>
                    <div className={`flex items-center ${passwordValue && /\d/.test(passwordValue) ? 'text-green-600' : 'text-gray-500'}`}>
                      <span className="mr-1">{passwordValue && /\d/.test(passwordValue) ? '✓' : '•'}</span>
                      Number
                    </div>
                    <div className={`flex items-center ${passwordValue && /[!@#$%^&*(),.?":{}|<>]/.test(passwordValue) ? 'text-green-600' : 'text-gray-500'}`}>
                      <span className="mr-1">{passwordValue && /[!@#$%^&*(),.?":{}|<>]/.test(passwordValue) ? '✓' : '•'}</span>
                      Symbol
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Confirm Password
                </label>
                <input
                  type="password"
                  {...register("confirmPassword", {
                    required: "Please confirm your password",
                    validate: (value) => {
                      const password = getValues("password");
                      if (value !== password) {
                        return "Passwords do not match";
                      }
                      return true;
                    }
                  })}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  id="confirmPassword"
                  placeholder="Confirm your password"
                />
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {/* Register Button */}
              <div>
                <button
                  type="submit"
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={passwordValue && passwordStrength.score < 2}
                >
                  Create Account
                </button>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Or sign up with
                  </span>
                </div>
              </div>

              {/* Social Login Buttons */}
              <div className="space-y-3">
                {/* Google Register Button */}
                <button
                  type="button"
                  onClick={() =>
                    signIn("google", { callbackUrl: redirect || "/" })
                  }
                  className="w-full inline-flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Sign up with Google
                </button>

                {/* GitHub Register Button */}
                <button
                  type="button"
                  onClick={() =>
                    signIn("github", { callbackUrl: redirect || "/" })
                  }
                  className="w-full inline-flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-gray-800 text-sm font-medium text-white hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0C5.37 0 0 5.37 0 12a12 12 0 008.21 11.39c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.05-1.41-4.05-1.41-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.8 1.31 3.49.99.11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.52-1.53.11-3.18 0 0 1.01-.32 3.3 1.24a11.46 11.46 0 016 0c2.29-1.56 3.3-1.24 3.3-1.24.63 1.65.23 2.87.11 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.84 1.1.84 2.22v3.29c0 .32.2.69.81.58A12 12 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Sign up with GitHub
                </button>
              </div>
            </form>

            {/* Login Link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{" "}
                <Link
                  href={`/login?redirect=${redirect || "/"}`}
                  className="font-medium text-indigo-600 hover:text-indigo-500 transition duration-150 ease-in-out"
                >
                  Sign in here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}